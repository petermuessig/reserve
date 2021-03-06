'use strict'

const fs = require('fs')
const path = require('path')
const util = require('util')

const readFileAsync = util.promisify(fs.readFile)
const statAsync = util.promisify(fs.stat)

const defaultHandlers = {
  custom: require('./handlers/custom'),
  file: require('./handlers/file'),
  status: require('./handlers/status'),
  url: require('./handlers/url')
}

const defaults = {
  hostname: undefined,
  port: 5000,
  mappings: [{
    match: /^\/proxy\/(https?)\/(.*)/,
    url: '$1://$2',
    'unsecure-cookies': true
  }, {
    match: '(.*)',
    file: './$1'
  }]
}

function applyDefaults (configuration) {
  Object.keys(defaults).forEach(property => {
    if (!Object.prototype.hasOwnProperty.call(configuration, property)) {
      configuration[property] = defaults[property]
    }
  })
}

function getHandler (handlers, types, mapping) {
  for (let index = 0; index < types.length; ++index) {
    const type = types[index]
    const redirect = mapping[type]
    if (redirect !== undefined) {
      return {
        handler: handlers[type],
        redirect,
        type
      }
    }
  }
  return {}
}

function checkHandler (handler, type) {
  if (typeof handler.redirect !== 'function') {
    throw new Error('Invalid "' + type + '" handler: redirect is not a function')
  }
}

function validateHandler (type) {
  const handlers = this.handlers
  let handler = handlers[type]
  if (typeof handler === 'string') {
    handler = require(handler)
    handlers[type] = handler
  }
  checkHandler(handler, type)
}

function setHandlers (configuration) {
  if (configuration.handlers) {
    // Default hanlders can't be overridden
    configuration.handlers = Object.assign({}, configuration.handlers, defaultHandlers)
  } else {
    configuration.handlers = defaultHandlers
  }
  Object.keys(configuration.handlers).forEach(validateHandler.bind(configuration))
  configuration.handler = getHandler.bind(null, configuration.handlers, Object.keys(configuration.handlers))
}

async function readSslFile (configuration, filePath) {
  if (path.isAbsolute(filePath)) {
    return (await readFileAsync(filePath)).toString()
  }
  return (await readFileAsync(path.join(configuration.ssl.cwd, filePath))).toString()
}

async function checkProtocol (configuration) {
  if (configuration.ssl) {
    configuration.protocol = 'https'
    configuration.ssl.cert = await readSslFile(configuration, configuration.ssl.cert)
    configuration.ssl.key = await readSslFile(configuration, configuration.ssl.key)
  } else {
    configuration.protocol = 'http'
  }
}

function checkMappingCwd (mapping) {
  if (!mapping.cwd) {
    mapping.cwd = process.cwd()
  }
}

function checkMappingMatch (mapping) {
  if (typeof mapping.match === 'string') {
    mapping.match = new RegExp(mapping.match)
  }
}

function checkMappingHandler (configuration, mapping) {
  const { handler } = configuration.handler(mapping)
  if (!handler) {
    throw new Error('Unknown handler for mapping: ' + JSON.stringify(mapping))
  }
  return handler
}

async function checkMappings (configuration) {
  for await (const mapping of configuration.mappings) {
    checkMappingCwd(mapping)
    checkMappingMatch(mapping)
    const handler = checkMappingHandler(configuration, mapping)
    if (handler.validate) {
      await handler.validate(mapping)
    }
  }
}

function setCwd (folderPath, configuration) {
  if (configuration.handlers) {
    Object.keys(configuration.handlers).forEach(prefix => {
      var handler = configuration.handlers[prefix]
      if (typeof handler === 'string' && handler.match(/^\.\.?\//)) {
        configuration.handlers[prefix] = path.join(folderPath, handler)
      }
    })
  }
  if (configuration.mappings) {
    configuration.mappings.forEach(mapping => {
      if (!mapping.cwd) {
        mapping.cwd = folderPath
      }
    })
  }
  if (configuration.ssl && !configuration.ssl.cwd) {
    configuration.ssl.cwd = folderPath
  }
}

function extend (filePath, configuration) {
  const folderPath = path.dirname(filePath)
  setCwd(folderPath, configuration)
  if (configuration.extend) {
    const basefilePath = path.join(folderPath, configuration.extend)
    delete configuration.extend
    return readFileAsync(basefilePath)
      .then(buffer => JSON.parse(buffer.toString()))
      .then(baseConfiguration => {
        // Only merge mappings
        const baseMappings = baseConfiguration.mappings
        const mergedConfiguration = Object.assign(baseConfiguration, configuration)
        if (baseMappings !== mergedConfiguration.mappings) {
          mergedConfiguration.mappings = [...configuration.mappings, ...baseMappings]
        }
        return extend(basefilePath, mergedConfiguration)
      })
  }
  return configuration
}

module.exports = {
  async check (configuration) {
    const checkedConfiguration = Object.assign({}, configuration)
    applyDefaults(checkedConfiguration)
    setHandlers(checkedConfiguration)
    await checkProtocol(checkedConfiguration)
    await checkMappings(checkedConfiguration)
    return checkedConfiguration
  },

  async read (fileName) {
    let filePath
    if (path.isAbsolute(fileName)) {
      filePath = fileName
    } else {
      filePath = path.join(process.cwd(), fileName)
    }
    return statAsync(filePath)
      .then(() => readFileAsync(filePath).then(buffer => JSON.parse(buffer.toString())))
      .then(configuration => extend(filePath, configuration))
  }
}
