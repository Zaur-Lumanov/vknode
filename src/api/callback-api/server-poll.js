const express = require('express')

module.exports = new class ServerPoll {
    constructor() {
        this.servers = {}
        this.listened = []
    }

    get(port) {
        port = +port

        if (isNaN(port) || port < 1 || port > 65536) {
            return new Error(`Invalid port ${port}`)
        }

        if (!this.servers[port]) {
            try {
                const app = express()

                this.servers[port] = app
            } catch (err) {
                console.log(err)
            }
        }

        return this.servers[port]
    }

    listen(port) {
        port = +port

        if (isNaN(port) || port < 1 || port > 65536) {
            return new Error(`Invalid port ${port}`)
        }

        if (this.servers[port] && this.listened.indexOf(port) === -1) {
            this.listened.push(port)

            try {
                this.servers[port].listen(port)
            } catch (err) {
                console.log(err)
            }
        }
    }
}