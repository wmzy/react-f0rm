import hello from '../src';

describe('hello world', () => {
  it('should return `hello world`', () => {
    hello().should.be.equal('hello world');
  });
});
