import { Flags } from '@prokopschield/argv';
import assert from 'assert';
import { encode } from 'doge-json';
import { contentType } from 'mime-types';
import { listen } from 'nodesite.eu-local';
import { sanitizeRecord } from 'ps-std';

import { getObject, putObject, serializeWrapHash } from './serialize';
import { File, Directory, Entry, Wrapper } from './types';

const hash_regexp = /[a-f0-9]{64}/g;

export async function serve(flags: Flags) {
	flags.alias('file', 'f').alias('port', 'p').alias('name', 'n');

	const { port, file, name } = flags.expectMutate(['file', 'port', 'name'], {
		port: '8080',
	});

	const { create } = listen({
		interface: 'http',
		name: name || 'serve',
		port: Number(port),
	});

	const hash = file?.match(/^[a-f0-9]{64}$/g)
		? file
		: await serializeWrapHash(String(file));

	create('/', async (request) => {
		try {
			const headers = sanitizeRecord(request.head);

			const [root] = request.uri.match(hash_regexp) ||
				headers['referer']?.match(hash_regexp) || [hash];

			const index = request.uri.indexOf(root);

			const pathname = new URL(
				index === -1
					? request.uri
					: request.uri.slice(index + root.length),
				'a://b'
			).pathname.slice(1);

			const received = await getObject<Wrapper | Entry>(root);

			const wrapper =
				received && typeof received === 'object'
					? received.type === 'wrapper'
						? received
						: received.type === 'directory'
						? { type: 'wrapper', directory: root }
						: {
								selected: 'file',
								directory: await putObject<Directory>({
									type: 'directory',
									children: { file: root },
								}),
						  }
					: {
							type: 'wrapper',
							selected: 'file',
							directory: await putObject<Directory>({
								type: 'directory',
								children: {
									file: await putObject<File>({
										type: 'file',
										body: root,
										contentType:
											contentType(pathname) ||
											'text/plain',
									}),
								},
							}),
					  };

			const { selected } = wrapper;
			const directory = await getObject<Directory>(wrapper.directory);
			const parts = ((selected || '') + '/' + (pathname || ''))
				.split('/')
				.filter((a) => a);

			assert(
				directory?.type === 'directory',
				`${root} is not a valid descriptor.`
			);

			let entry: Entry = directory;

			for (const part of parts) {
				if (entry?.type === 'directory') {
					const new_entry: Entry | null = await getObject<Entry>(
						entry.children[part]
					);

					if (new_entry && typeof new_entry === 'object') {
						entry = new_entry;
					}
				}
			}

			switch (entry.type) {
				case 'symlink': {
					return {
						statusCode: 302,
						head: {
							Location: entry.target,
						},
					};
				}
				case 'file': {
					return {
						statusCode: 200,
						head: {
							'content-type': entry.contentType,
						},
						hash: entry.body,
					};
				}
				case 'directory': {
					const wrapper = await putObject<Wrapper>({
						type: 'wrapper',
						directory: await putObject<Directory>(directory),
					});

					if (pathname.endsWith('.json')) {
						return {
							statusCode: 200,
							head: {
								'content-type': 'application/json',
							},
							body: encode(
								Object.fromEntries(
									await Promise.all(
										Object.entries(entry.children).map(
											async ([name, hash]) => {
												return [
													name,
													await getObject<Entry>(
														hash
													),
												];
											}
										)
									)
								)
							),
						};
					} else {
						const html =
							`<h1>Index of /${parts.join('/')}</h1>` +
							'<ul>' +
							(parts.length
								? '<li><a href="..">&lt&lt Parent Directory &gt&gt</a></li>'
								: '') +
							(
								await Promise.all(
									Object.entries(entry.children).map(
										async ([child_name, child_hash]) => {
											const child_entry =
												await getObject<Entry>(
													child_hash
												);

											const is_directory =
												child_entry?.type ===
												'directory';

											const slash = is_directory
												? '/'
												: '';

											return `<li><a href="/${
												[
													wrapper,
													...parts,
													child_name,
												].join('/') + slash
											}">${child_name}${slash}</a></li>`;
										}
									)
								)
							).join('') +
							'</ul>';

						return {
							statusCode: 200,
							head: {
								'content-type': 'text/html; charset=utf-8',
							},
							body: html,
						};
					}
				}
				default: {
					return {
						head: { 'content-type': 'application/json' },
						body: encode(entry),
					};
				}
			}
		} catch (error) {
			return {
				statusCode: 400,
				head: { 'content-type': 'text/plain' },
				body: String(error),
			};
		}
	});
}
