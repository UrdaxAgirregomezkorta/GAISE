const fs = require('fs');
const { getAdapter, listAdapterIds } = require('./adapters');

function parseArgs(argv) {
    const options = {
        site: 'iparralde',
        out: null,
        params: {},
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--site') {
            options.site = argv[i + 1];
            i += 1;
            continue;
        }

        if (arg === '--out') {
            options.out = argv[i + 1];
            i += 1;
            continue;
        }

        if (arg === '--headful') {
            options.params.headless = false;
            continue;
        }

        if (arg === '--help' || arg === '-h') {
            options.help = true;
        }
    }

    return options;
}

function validateListings(listings) {
    listings.forEach((listing, index) => {
        if (!listing || typeof listing !== 'object') {
            throw new Error(`Invalid listing at index ${index}.`);
        }

        const id = String(listing.id || '').trim();
        if (!id) {
            throw new Error(`Listing at index ${index} has an empty id.`);
        }
    });

    return listings;
}

async function run({ site, params }) {
    const adapter = getAdapter(site);

    if (!adapter) {
        throw new Error(`Unknown site "${site}". Available: ${listAdapterIds().join(', ')}`);
    }

    const listings = await adapter.list(params);
    return validateListings(listings);
}

function printHelp() {
    const adapters = listAdapterIds().join(', ');
    process.stdout.write('Usage: node scrape.js --site <siteId> [--out listings.json] [--headful]\n');
    process.stdout.write(`Available sites: ${adapters}\n`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        printHelp();
        return;
    }

    const listings = await run({ site: options.site, params: options.params });
    const json = JSON.stringify(listings, null, 2);

    if (options.out) {
        fs.writeFileSync(options.out, json, 'utf8');
    }

    process.stdout.write(`${json}\n`);
}

main().catch((error) => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
});