
const { assertRevert } = require('./helpers/assertRevert.js');
const EVMRevert = require('./helpers/EVMRevert');

const OrderedIntervalList = artifacts.require('OrderedIntervalListWrapper');
const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .use(require('chai-as-promised'))
  .should();

async function validateList (listContract, size) {
  const first = (await listContract.firstIndex.call());
  if (size === 0 && first.equals(new BigNumber(0))) {
    return true;
  }
  if (first.equals(new BigNumber(0))) {
    return false;
  }
  var curIndex = first;
  var count = 1;

  var list = [];
  (await listContract.getPrev.call(first)).should.be.bignumber.equal(0);
  while (!(await listContract.getNext.call(curIndex)).equals(new BigNumber(0)) && count < size) {
    let nextIndex = await listContract.getNext.call(curIndex);
    let prevIndex = await listContract.getPrev.call(curIndex);
    let currentInterval = await listContract.get.call(curIndex);
    list.push('[' + currentInterval[0].toString() + ',' + currentInterval[1].toString() + ')');

    if (nextIndex > 0) {
      let next = await listContract.get.call(nextIndex);

      assert(next[0] >= currentInterval[1]);
    }

    if (prevIndex > 0) {
      let next = await listContract.get.call(prevIndex);
      assert(next[1] <= currentInterval[0]);
    }

    count = count + 1;
    curIndex = nextIndex;
  }

  let currentInterval = await listContract.get.call(curIndex);
  list.push('[' + currentInterval[0].toString() + ',' + currentInterval[1].toString() + ')');
  assert((await listContract.getNext.call(curIndex)).equals(new BigNumber(0)));

  currentInterval = await listContract.get.call(curIndex);

  (await listContract.getNext.call(curIndex)).should.be.bignumber.equal(0);

  size.should.be.equal(count);
}

contract('OrderedIntervalList', function () {
  beforeEach(async function () {
    this.orderedList = await OrderedIntervalList.new();
  });

  describe('insert', function () {
    it('check init state', async function () {
      await this.orderedList.get(0).should.rejectedWith(EVMRevert);
      await this.orderedList.get(1).should.rejectedWith(EVMRevert);
      await this.orderedList.get(-1).should.rejectedWith(EVMRevert);
    });

    it('insert one', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      const interval = await this.orderedList.get(1);

      interval[0].should.be.bignumber.equal(0);
      interval[1].should.be.bignumber.equal(100);

      await validateList(this.orderedList, 1);
    });

    it('insert twice', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 101, 200);

      const intervalFirst = await this.orderedList.get(1);
      const intervalSecond = await this.orderedList.get(2);

      intervalFirst[0].should.be.bignumber.equal(0);
      intervalFirst[1].should.be.bignumber.equal(100);
      intervalSecond[0].should.be.bignumber.equal(101);
      intervalSecond[1].should.be.bignumber.equal(200);

      await validateList(this.orderedList, 2);
    });

    it('insert error', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 101, 200);

      // already inserted position
      await this.orderedList.set(2, 0, 100, 200).should.rejectedWith(EVMRevert);

      // range collision
      await this.orderedList.set(1, 2, 150, 200).should.rejectedWith(EVMRevert);

      await this.orderedList.set(2, 0, 201, 300);

      const interval = await this.orderedList.get(3);
      interval[0].should.be.bignumber.equal(201);
      interval[1].should.be.bignumber.equal(300);

      // zero interval size
      assertRevert(this.orderedList.set(3, 0, 300, 300));
      // begin and end swapped
      assertRevert(this.orderedList.set(3, 0, 305, 302));

      await validateList(this.orderedList, 3);
    });
  });

  describe('remove', function () {
    it('check init state', async function () {
      await this.orderedList.remove(0, 0, 100).should.rejectedWith(EVMRevert);
      await this.orderedList.remove(1, 0, 100).should.rejectedWith(EVMRevert);
      await this.orderedList.remove(-1, 0, 100).should.rejectedWith(EVMRevert);
    });

    it('full remove one element', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.remove(1, 0, 100);

      await this.orderedList.get(1).should.rejectedWith(EVMRevert);

      await validateList(this.orderedList, 0);

      await this.orderedList.remove(1, 0, 100).should.be.rejectedWith(EVMRevert);

      await this.orderedList.set(0, 0, 0, 100);
      await validateList(this.orderedList, 1);
    });

    it('make hole inside interval', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.remove(1, 50, 70);

      let interval = await this.orderedList.get(1);

      interval[0].should.be.bignumber.equal(0);
      interval[1].should.be.bignumber.equal(50);

      const id = (await this.orderedList.maxIndex.call());
      interval = await this.orderedList.get(id);

      interval[0].should.be.bignumber.equal(70);
      interval[1].should.be.bignumber.equal(100);

      await validateList(this.orderedList, 2);
    });

    it('make and fill hole', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 101, 200);
      await this.orderedList.set(2, 0, 201, 300);

      // already inserted position
      await this.orderedList.set(1, 0, 100, 150).should.be.rejectedWith(EVMRevert);

      await this.orderedList.remove(2, 101, 200);
      await this.orderedList.get(2).should.be.rejectedWith(EVMRevert);

      await this.orderedList.set(1, 3, 101, 150);

      let interval = await this.orderedList.get(4);

      interval[0].should.be.bignumber.equal(101);
      interval[1].should.be.bignumber.equal(150);
      await validateList(this.orderedList, 3);
    });

    it('make and fill hole from multiple intervals', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 101, 200);
      await this.orderedList.set(2, 0, 201, 300);
      await this.orderedList.set(3, 0, 401, 500);

      await this.orderedList.remove(2, 101, 200);
      await this.orderedList.remove(3, 201, 300);

      // invalid previous element
      await this.orderedList.set(2, 4, 150, 170).should.be.rejectedWith(EVMRevert);
      await this.orderedList.set(1, 3, 150, 170).should.be.rejectedWith(EVMRevert);
      await this.orderedList.set(1, 4, 102, 110);
      await validateList(this.orderedList, 3);
      await this.orderedList.set(1, 5, 101, 102);
      await validateList(this.orderedList, 3);

      var interval = await this.orderedList.get(5);
      interval[0].should.be.bignumber.equal(101);
      interval[1].should.be.bignumber.equal(110);

      await validateList(this.orderedList, 3);
    });

    it('remove first and last element', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      let idFirst = await this.orderedList.lastInserted.call();
      await this.orderedList.set(1, 0, 101, 200);
      let idNewFirst = await this.orderedList.lastInserted.call();
      await this.orderedList.set(2, 0, 201, 300);
      let idNewLast = await this.orderedList.lastInserted.call();
      await this.orderedList.set(3, 0, 401, 500);
      let idLast = await this.orderedList.lastInserted.call();

      await this.orderedList.remove(idFirst, 0, 100);
      await this.orderedList.remove(idLast, 401, 500);

      (await this.orderedList.getNext.call(idNewLast)).should.be.bignumber.equal(0);
      (await this.orderedList.getPrev.call(idNewFirst)).should.be.bignumber.equal(0);

      await validateList(this.orderedList, 2);
    });

    it('invalid range removing', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 101, 300);
      // empty range remove
      await this.orderedList.remove(1, 99, 99).should.be.rejectedWith(EVMRevert);
      // intersect only prefix
      await this.orderedList.remove(1, 50, 150).should.be.rejectedWith(EVMRevert);
      // intersect only suffix
      await this.orderedList.remove(2, 50, 150).should.be.rejectedWith(EVMRevert);
      // range greater than interval
      await this.orderedList.remove(2, 0, 500).should.be.rejectedWith(EVMRevert);
    });
  });

  describe('merge intervals', function () {
    it('full merge', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 101, 200);
      await this.orderedList.set(2, 0, 201, 300);

      await validateList(this.orderedList, 3);

      await this.orderedList.set(1, 2, 100, 101);
      await this.orderedList.set(1, 3, 200, 201);

      await validateList(this.orderedList, 1);

      await this.orderedList.set(1, 0, 300, 400);
      const id = await this.orderedList.lastInserted.call();
      const interval = await this.orderedList.get(id);

      interval[0].should.be.bignumber.equal(0);
      interval[1].should.be.bignumber.equal(400);

      await validateList(this.orderedList, 1);
    });

    it('merge with previous interval', async function () {
      await this.orderedList.set(0, 0, 0, 100);
      await this.orderedList.set(1, 0, 200, 300);
      const idCenter = await this.orderedList.lastInserted.call();
      await this.orderedList.set(2, 0, 400, 500);
      const idLast = await this.orderedList.lastInserted.call();

      await this.orderedList.set(idLast, 0, 500, 600);

      let interval = await this.orderedList.get(idLast);

      interval[0].should.be.bignumber.equal(400);
      interval[1].should.be.bignumber.equal(600);

      await this.orderedList.set(idCenter, idLast, 300, 350);

      interval = await this.orderedList.get(idCenter);
      interval[0].should.be.bignumber.equal(200);
      interval[1].should.be.bignumber.equal(350);

      await validateList(this.orderedList, 3);
    });

    it('merge with next interval', async function () {
      await this.orderedList.set(0, 0, 50, 100);
      const idFirst = await this.orderedList.lastInserted.call();
      await this.orderedList.set(1, 0, 200, 300);
      const idCenter = await this.orderedList.lastInserted.call();
      await this.orderedList.set(2, 0, 400, 500);

      await this.orderedList.set(0, idFirst, 0, 50);

      let interval = await this.orderedList.get(idFirst);

      interval[0].should.be.bignumber.equal(0);
      interval[1].should.be.bignumber.equal(100);

      await this.orderedList.set(idFirst, idCenter, 150, 200);

      interval = await this.orderedList.get(idCenter);
      interval[0].should.be.bignumber.equal(150);
      interval[1].should.be.bignumber.equal(300);

      await validateList(this.orderedList, 3);
    });
  });
});
