import hello from '../src';

describe('hello world', function () {
  it('should return `hello world`', function () {
    hello().should.be.equal('hello world');
  });
});
