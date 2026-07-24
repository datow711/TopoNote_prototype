import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const workDir = process.cwd();
const repoDir = path.resolve(workDir, '../../..');
const masterPath = path.join(repoDir, 'assets', '地名總表重整用_0723.xlsx');
const inventoryPath = path.join(repoDir, 'assets', '115.1.12_地名後臺清冊_合併.xlsx');

async function loadWorkbook(filePath) {
  const input = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(input);
}

const [masterWorkbook, inventoryWorkbook] = await Promise.all([
  loadWorkbook(masterPath),
  loadWorkbook(inventoryPath),
]);

console.log((await masterWorkbook.inspect({
  kind: 'sheet',
  include: 'id,name',
  maxChars: 10000,
})).ndjson);

for (const sheetName of ['Places', '地名總表']) {
  console.log(`MASTER ${sheetName}`);
  console.log((await masterWorkbook.inspect({
    kind: 'region',
    sheetId: sheetName,
    range: 'A1:AK5',
    maxChars: 16000,
  })).ndjson);
  console.log((await masterWorkbook.inspect({
    kind: 'computedStyle',
    sheetId: sheetName,
    range: 'A1:AK3',
    maxChars: 8000,
  })).ndjson);
  const preview = await masterWorkbook.render({
    sheetName,
    range: 'A1:AK8',
    scale: 1,
    format: 'png',
  });
  await fs.writeFile(
    path.join(workDir, `preview-${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

console.log('INVENTORY 總表');
console.log((await inventoryWorkbook.inspect({
  kind: 'region',
  sheetId: '總表',
  range: 'A1:Y5',
  maxChars: 16000,
})).ndjson);
console.log((await inventoryWorkbook.inspect({
  kind: 'computedStyle',
  sheetId: '總表',
  range: 'A1:Y3',
  maxChars: 8000,
})).ndjson);
const inventoryPreview = await inventoryWorkbook.render({
  sheetName: '總表',
  range: 'A1:Y8',
  scale: 1,
  format: 'png',
});
await fs.writeFile(
  path.join(workDir, 'preview-inventory.png'),
  new Uint8Array(await inventoryPreview.arrayBuffer()),
);
