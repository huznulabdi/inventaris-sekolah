'use strict';
const { PREFIX, SCHOOL, send } = require('../lib/core');

module.exports = (req, res) => {
  send(res, 200, { school: SCHOOL, prefix: PREFIX });
};
