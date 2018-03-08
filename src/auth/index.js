module.exports = (...data) => {
    return new class Auth {
        constructor() {
            if (data.length == 2 || data.length == 3) {
                return this.password(data)
            }
        }

        password(data) {

        }
    }(...data)
}