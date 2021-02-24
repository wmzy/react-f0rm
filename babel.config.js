module.exports = {
  presets: [['@babel/env', {modules: false}], '@babel/preset-react'],
  env: {
    test: {
      presets: [['@babel/env', {targets: {node: true}}], '@babel/preset-react']
    }
  }
};
