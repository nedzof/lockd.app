import UnifiedScanner from './services/scanner/unifiedScanner';

async function main() {
    const scanner = new UnifiedScanner();
    await scanner.start();
}

main().catch(error => {
    console.error('Error running scanner:', error);
    process.exit(1);
}); 