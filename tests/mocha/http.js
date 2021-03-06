'use strict'

const EventEmitter = require('events')
const Response = require('../../mock/Response')
const empty = 'http://www.mocked.com/empty'
const echo = 'http://www.mocked.com/echo'
const echos = 'https://www.mocked.com/echo'

module.exports = {

  urls: {
    empty,
    echo,
    echos
  },

  request: (url, options, callback) => {
    const result = new EventEmitter()
    const response = new Response()
    if (url === echo || url === echos) {
      const statusCode = options.headers['x-status-code']
      response.writeHead(statusCode, options.headers)
    } else /* if (url === empty) */ {
      response.writeHead(200)
    }
    result.write = chunk => {
      response.write(chunk)
    }
    result.end = () => {
      response.end()
      callback(response)
    }
    return result
  },

  createServer: () => {
    return {
      listen: (port, hostname, callback) => {
        if (hostname === 'error') {
          callback(new Error('error'))
        } else {
          callback(null)
        }
      }
    }
  }
}
