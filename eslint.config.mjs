export default [
    {
        files: ['server/**/*.js', 'public/*.js', 'tests/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', window: 'readonly', document: 'readonly', fetch: 'readonly', console: 'readonly', process: 'readonly', localStorage: 'readonly', location: 'readonly', URLSearchParams: 'readonly', Node: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', confirm: 'readonly', alert: 'readonly', ADWDatabase: 'readonly', ADWAuth: 'readonly', ADWBooking: 'readonly', ADWNotifications: 'readonly', ADWEscape: 'readonly', ADWMec: 'readonly', JSDOM: 'readonly' }
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-undef': 'error',
            'no-redeclare': 'error',
            'no-func-assign': 'error'
        }
    }
];
