import { PolymarketService } from '../services/polymarket.service';

async function testPolymarket() {
  const service = new PolymarketService();

  // Test URLs with original query parameters
  const urls = [
    'https://polymarket.com/event/us-recession-in-2025?tid=1739219141858',
    'https://polymarket.com/event/germany-parliamentary-election?tid=1739217408445',
    'https://polymarket.com/event/will-putin-meet-with-trump-by-first-100-days?tid=1739217291887'
  ];

  console.log('\nTesting URL validation:');
  for (const url of urls) {
    console.log(`\nTesting URL: ${url}`);
    const result = await service.validatePolymarketUrl(url);
    if (result) {
      console.log('Match found:');
      console.log('- Probability:', result.probability.toFixed(1) + '%');
      console.log('- Volume:', result.volume.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
      console.log('- Outcomes:');
      result.outcomes.forEach(outcome => {
        console.log(`  * ${outcome.name}: ${outcome.probability.toFixed(1)}%`);
      });
    } else {
      console.log('No matching market found');
    }
  }

  // Test direct title searches with actual market slugs
  const searchTerms = [
    'us-recession-announced-by-nber-before-june-2025',
    'germany-parliamentary-election',
    'trump-wins-ends-ukraine-war-in-90-days'
  ];

  console.log('\nTesting direct title searches:');
  for (const term of searchTerms) {
    console.log(`\nSearching for: "${term}"`);
    const results = await service.searchMarketsByTitle(term);
    if (results.length > 0) {
      console.log(`Found ${results.length} matching market(s):`);
      results.forEach((result, index) => {
        console.log(`\nMatch ${index + 1}:`);
        console.log('- URL:', result.url);
        console.log('- Probability:', result.probability.toFixed(1) + '%');
        console.log('- Volume:', result.volume.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
        console.log('- Outcomes:');
        result.outcomes.forEach(outcome => {
          console.log(`  * ${outcome.name}: ${outcome.probability.toFixed(1)}%`);
        });
      });
    } else {
      console.log('No matching markets found');
    }
  }
}

testPolymarket().catch(console.error); 