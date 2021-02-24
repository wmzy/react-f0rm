const register = require('@babel/register').default;

global.__DEV__ = true;

register({extensions: ['.js', '.jsx']});
