export interface File {
	type: 'file';
	contentType: string;
	body: string;
}

export interface Directory {
	type: 'directory';
	children: Record<string, string>;
}

export interface SymbolicLink {
	type: 'symlink';
	target: string;
}

export type Entry = Directory | File | SymbolicLink;

export interface Wrapper {
	type: 'wrapper';
	selected?: string;
	directory: string;
}
