// Starts the Auth + Firestore emulators for the demo project, keeping data between runs
// in .emulator-data (gitignored). --import is only passed once an export exists.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const dir = '.emulator-data';
const args = [
	'emulators:start',
	'--only',
	'auth,firestore',
	'--project',
	'demo-perancial',
	`--export-on-exit=${dir}`
];
if (existsSync(`${dir}/firebase-export-metadata.json`)) args.push(`--import=${dir}`);

const child = spawn('firebase', args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
