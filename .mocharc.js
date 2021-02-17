module.exports = {
  extension: 'js,ts',
  recursive: true,
  exclude: ['mock', 'typings', 'fixtures'],
  require: ['test/babel-register', 'should', 'should-sinon']
}
