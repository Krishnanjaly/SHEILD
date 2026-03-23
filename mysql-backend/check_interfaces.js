const os = require("os");
const interfaces = os.networkInterfaces();
console.log(JSON.stringify(interfaces, null, 2));
