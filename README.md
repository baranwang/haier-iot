# Haier IoT

## Installation

```bash
npm add haier-iot
```

## Usage

```javascript
const HaierIoT = require('haier-iot');

const haier = new HaierIoT({
  username: 'username',
  password: 'password',
  storageDir: '/usr/local/var/haier-iot',
});

haier.connect()

haier.subscribeDevices(deviceIds);
```

## Who Uses It

- [homebridge-plugin-haier](https://github.com/baranwang/homebridge-plugin-haier)