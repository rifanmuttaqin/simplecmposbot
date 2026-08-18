const dns = require('dns');

const DNS_OVERRIDES = {
  'api.xiaomimimo.com': '47.236.158.71',
};

const originalLookup = dns.lookup;

dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const host = hostname.replace(/:\d+$/, '');

  if (DNS_OVERRIDES[host]) {
    const ip = DNS_OVERRIDES[host];
    const family = ip.includes(':') ? 6 : 4;
    if (options.all) {
      callback(null, [{ address: ip, family }]);
    } else {
      callback(null, ip, family);
    }
    return;
  }

  return originalLookup.call(this, hostname, options, callback);
};
