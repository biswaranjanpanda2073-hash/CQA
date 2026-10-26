const passFailData = [
    { pass: 100, fail: 10, name: "RECEIVING" },
    { pass: 200, fail: 20, name: "INSPECTION" }
];
const output = passFailData.map(d => d.pass);
const rejections = passFailData.map(d => d.fail);
console.log(output);
console.log(rejections);
