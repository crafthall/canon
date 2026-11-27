#!/usr/bin/env node
// Launcher of the plugin's `hub`: the core is bundled in hub-core.mjs (built from src/).
import { pluginMain } from './hub-core.mjs';

process.exitCode = pluginMain(process.argv.slice(2));
