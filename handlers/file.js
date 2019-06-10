'use strict'

const fs = require('fs')
const mime = require('mime')
const path = require('path')
const util = require('util')

const defaultMimeType = mime.getType('bin')
const statAsync = util.promisify(fs.stat)

function sendFile (response, filePath, stat) {
  return new Promise((resolve, reject) => {
    response.writeHead(200, {
      'Content-Type': mime.getType(path.extname(filePath)) || defaultMimeType,
      'Content-Length': stat.size
    })
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('end', resolve)
      .pipe(response)
  })
}

function sendIndex (response, folderPath) {
  const indexPath = path.join(folderPath, 'index.html')
  return statAsync(indexPath)
    .then(stat => sendFile(response, indexPath, stat))
}

module.exports = {
  schema: {},
  redirect: (request, response) => {
    const filePath = /([^?#]+)/.exec(request.redirect)[1] // filter URL parameters & hash
    return statAsync(filePath)
      .then(stat => stat.isDirectory() ? sendIndex(response, filePath) : sendFile(response, filePath, stat))
  })
}