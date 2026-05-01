'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVdfLibraryFolderPaths } = require('./steam-library-roots');

test('parseVdfLibraryFolderPaths reads quoted path keys', () => {
  const vdf = `
"libraryfolders"
{
	"0"
	{
		"path"		"D:\\\\SteamLibrary"
	}
	"1"
	{
		"path"		"E:\\\\Games\\\\Steam2"
	}
}
`;
  const paths = parseVdfLibraryFolderPaths(vdf);
  assert.deepEqual(paths, ['D:\\SteamLibrary', 'E:\\Games\\Steam2']);
});
