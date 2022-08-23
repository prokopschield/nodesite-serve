import { decode, encode } from 'doge-json';
import fs from 'fs';
import { contentType } from 'mime-types';
import nsblob from 'nsblob';
import path from 'path';

import { Directory, Entry, Wrapper } from './types';

export async function serialize(file: string): Promise<Entry> {
	try {
		const stats = await fs.promises.lstat(file);

		if (stats.isFile()) {
			return {
				type: 'file',
				contentType: contentType(path.basename(file)) || 'text/plain',
				body: await nsblob.store_file(file),
			};
		} else if (stats.isDirectory()) {
			return {
				type: 'directory',
				children: Object.fromEntries(
					await Promise.all(
						(
							await fs.promises.readdir(file)
						).map(async (filename) => {
							return [
								filename,
								await putObject(
									await serialize(
										path.resolve(file, filename)
									)
								),
							];
						})
					)
				),
			};
		} else if (stats.isSymbolicLink()) {
			const target = await fs.promises.readlink(file);
			const resolved = path.resolve(file, '..', target);

			if (resolved.includes(path.resolve(file))) {
				try {
					return await serialize(resolved);
				} catch {
					// it's ok to fail, just return the symlink
				}
			}

			return {
				type: 'symlink',
				target: await fs.promises.readlink(file),
			};
		} else {
			return {
				type: 'file',
				contentType: 'application/json',
				body: await putObject(stats),
			};
		}
	} catch (error) {
		return {
			type: 'file',
			contentType: 'text/plain',
			body: await nsblob.store(String(error)),
		};
	}
}

export async function serializeWrap(file: string): Promise<Wrapper> {
	const entry = await serialize(file);

	return entry.type === 'directory'
		? {
				type: 'wrapper',
				directory: await putObject<Directory>(entry),
		  }
		: {
				type: 'wrapper',
				directory: await putObject<Directory>({
					type: 'directory',
					children: {
						[path.basename(file)]: await nsblob.store(
							encode(entry)
						),
					},
				}),
		  };
}

export async function serializeWrapHash(file: string): Promise<string> {
	return nsblob.store(encode(await serializeWrap(file)));
}

export async function putObject<T extends object>(object: T): Promise<string> {
	return nsblob.store(encode(object));
}

export async function getObject<T>(hash: string): Promise<T | null> {
	return decode(String(await nsblob.fetch(hash || '')));
}
