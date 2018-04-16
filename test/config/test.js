const host = 'http://localhost:3000';

module.exports = {
    port: process.env.PORT || 3000,
    campsi: {
        title: 'Test Arezzo',
        publicURL: host,
        mongo: {
            host: 'localhost',
            port: 27017,
            database: 'test-campsi-service-auth'
        }
    },
    services: {
        trace: {
            title: 'trace'
        },
        auth: {
            title: 'Authentification',
            options: {
                collectionName: '__users__',
                session: {
                    secret: 'sqkerhgtkusyd'
                },
                providers: {
                    local: require('../../lib/providers/local')({
                        baseUrl: host + '/auth',
                        salt: 'CNDygyeFC6536964425994',
                        resetPasswordTokenExpiration: 10
                    })
                }
            }
        }
    }
};
