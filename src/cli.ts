#!/usr/bin/env node

import argv from '@prokopschield/argv';
import { ready_promise } from 'nodesite.eu';
import nsblob from 'nsblob';

import { serializeWrapHash } from './modules/serialize';
import { serve } from './modules/serve';

const { command } = argv.expectMutate(['command']);

export async function main() {
	switch (command) {
		case 'serve':
			return serve(argv);
		default:
			console.log(await serializeWrapHash(String(command)));
			nsblob.socket.close();
			ready_promise.then((socket) => socket.close());
			return;
	}
}

main();
