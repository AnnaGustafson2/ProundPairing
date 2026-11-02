const { loadApp } = require('./helpers/loadApp');

test('app loads', () => {
  loadApp();
  //expect(document.getElementById('member-names')).not.toBeNull();
});