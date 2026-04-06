// Mock carrier database with 6 carriers, each with unique rate behavior and response formats.

const carriers = [
  {
    id: 'SMARTEFREIGHT',
    name: 'SmarteFreight Canada',
    email: 'ron@smartefreight.ca',
    base_rate_multiplier: 1.0,       // mid-range
    response_reliability: 1.0,       // always responds
    transit_days_range: [2, 4],
    service_types: ['FTL', 'LTL'],
    fuel_surcharge_range: [0.05, 0.08], // 5-8% of base rate
    response_format: 'messy',        // returns email-style text
    amazon_only: false
  },
  {
    id: 'REACH_FREIGHT',
    name: 'Reach & Freight',
    email: 'hannah@reachfreight.com',
    base_rate_multiplier: 0.95,      // competitive on FTL
    response_reliability: 1.0,       // always responds
    transit_days_range: [3, 5],
    service_types: ['FTL'],
    fuel_surcharge_range: [0, 0],
    response_format: 'messy',        // bare numbers, no currency
    amazon_only: false
  },
  {
    id: 'BORDERLESS',
    name: 'Borderless Freight',
    email: 'quotes@borderlessfreight.com',
    base_rate_multiplier: 0.88,      // strong on cross-border
    response_reliability: 0.9,       // 90% response rate
    transit_days_range: [2, 3],
    service_types: ['FTL', 'LTL'],
    fuel_surcharge_range: [0, 0],
    response_format: 'messy',        // lowercase cad, no dollar sign
    amazon_only: false
  },
  {
    id: 'CONSOLIDATED',
    name: 'Consolidated Fastrate',
    email: 'rates@consolidatedfastrate.com',
    base_rate_multiplier: 1.2,       // premium pricing, fastest
    response_reliability: 1.0,       // always responds
    transit_days_range: [1, 2],
    service_types: ['FTL'],
    fuel_surcharge_range: [0, 0],    // all-inclusive
    response_format: 'clean',        // returns structured JSON
    amazon_only: false
  },
  {
    id: 'AMAZON_FREIGHT',
    name: 'Amazon Freight',
    email: 'freight@amazon.com',
    base_rate_multiplier: 0.92,      // competitive for Amazon destinations
    response_reliability: 1.0,       // always responds for eligible
    transit_days_range: [2, 3],
    service_types: ['FTL'],
    fuel_surcharge_range: [0, 0],
    response_format: 'clean',        // returns structured response
    amazon_only: true                // only available for Amazon/FBA destinations
  },
  {
    id: 'XPO',
    name: 'XPO Logistics',
    email: 'quotes@xpo.com',
    base_rate_multiplier: 1.05,      // variable pricing
    response_reliability: 0.7,       // 70% response rate
    transit_days_range: [3, 6],
    service_types: ['FTL', 'LTL'],
    fuel_surcharge_range: [0, 0.05],
    response_format: 'messy',        // numbers as words
    amazon_only: false
  }
];

/**
 * Generate a simulated rate based on weight and a rough distance factor.
 * Base rate = (weight / 1000) * distance_factor * carrier multiplier + random variation.
 */
function generateRate(carrier, weightLbs) {
  // Rough distance factor (simulating ~1500 mile average lane)
  const distanceFactor = 0.055;
  const baseRate = (weightLbs / 1000) * distanceFactor * 1000 * carrier.base_rate_multiplier;

  // Add random variation: 0.85 to 1.15 range for natural spread
  const variation = 0.85 + Math.random() * 0.30;
  let rate = baseRate * variation;

  // Add fuel surcharge if applicable
  const [minSurcharge, maxSurcharge] = carrier.fuel_surcharge_range;
  const fuelSurchargePercent = minSurcharge + Math.random() * (maxSurcharge - minSurcharge);
  const fuelSurcharge = Math.round(rate * fuelSurchargePercent * 100) / 100;

  rate = Math.round((rate + fuelSurcharge) * 100) / 100;

  // Random transit days within range
  const [minDays, maxDays] = carrier.transit_days_range;
  const transitDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;

  return { rate, fuelSurcharge, transitDays };
}

/**
 * Simulate a carrier response in either clean or messy format.
 * Clean carriers return structured objects. Messy carriers return email-like text.
 */
function simulateResponse(carrier, weightLbs) {
  const { rate, fuelSurcharge, transitDays } = generateRate(carrier, weightLbs);
  const serviceType = carrier.service_types[0]; // default to first
  const equipment = 'Dry Van';
  const pickupWindow = '09:00-12:00';

  if (carrier.response_format === 'clean') {
    // Consolidated Fastrate and Amazon Freight return clean structured data
    if (carrier.id === 'CONSOLIDATED') {
      return {
        type: 'structured',
        data: {
          rate: rate,
          currency: 'CAD',
          transit_days: transitDays,
          service_type: serviceType,
          equipment: equipment,
          pickup_window: pickupWindow,
          fuel_surcharge: 0,
          accessorials: 0,
          notes: 'All-inclusive rate. No additional surcharges.'
        }
      };
    }
    // Amazon Freight
    return {
      type: 'structured',
      data: {
        rate: rate,
        currency: 'CAD',
        transit_days: transitDays,
        service_type: serviceType,
        equipment: equipment,
        pickup_window: pickupWindow,
        fuel_surcharge: 0,
        accessorials: 0,
        notes: 'Amazon partner rate. Direct dock delivery.'
      }
    };
  }

  // Messy formats - each carrier has a different email style
  if (carrier.id === 'SMARTEFREIGHT') {
    const refNum = 'JM' + Math.floor(100000 + Math.random() * 900000);
    return {
      type: 'unstructured',
      raw_text: `Hi Cheryl, we can offer $${rate} CAD, ${transitDays} day transit, dry van. Pickup window 9am-noon. ${fuelSurcharge > 0 ? `Fuel surcharge of $${fuelSurcharge} included. ` : ''}Quote ref ${refNum}. - Ron`
    };
  }

  if (carrier.id === 'REACH_FREIGHT') {
    // Bare number, no dollar sign, no currency
    return {
      type: 'unstructured',
      raw_text: `Hello, our FTL rate is ${Math.round(rate)}. Please confirm total weight for this truck. Transit ${transitDays}-${transitDays + 1} days. Thanks, Hannah`
    };
  }

  if (carrier.id === 'BORDERLESS') {
    // Lowercase cad, no dollar sign
    return {
      type: 'unstructured',
      raw_text: `Rate for this lane: ${Math.round(rate)} cad, no surcharge, ${transitDays} days transit, dry van`
    };
  }

  if (carrier.id === 'XPO') {
    // Number written as words
    const wordRate = numberToWords(Math.round(rate));
    return {
      type: 'unstructured',
      raw_text: `We can do this for ${wordRate}, ${transitDays} day transit. Let us know.`
    };
  }

  // Fallback (should not hit)
  return {
    type: 'structured',
    data: { rate, currency: 'CAD', transit_days: transitDays }
  };
}

/**
 * Convert a number to approximate English words for XPO's messy format.
 * Handles common freight rate ranges (500-3000).
 */
function numberToWords(num) {
  // Lookup for hundreds expressed as "X hundred"
  const hundredNames = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const thousandNames = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  // Express as "X hundred" (e.g., 1300 = "thirteen hundred", 2400 = "twenty-four hundred")
  const inHundreds = Math.floor(num / 100);
  if (inHundreds >= 1 && inHundreds <= 20) {
    return `${hundredNames[inHundreds]} hundred`;
  }
  // Larger numbers: "X thousand Y hundred"
  if (num >= 2000) {
    const thousands = Math.floor(num / 1000);
    const remainder = Math.floor((num % 1000) / 100);
    let result = `${thousandNames[thousands] || thousands} thousand`;
    if (remainder > 0) result += ` ${hundredNames[remainder]} hundred`;
    return result;
  }
  return String(num);
}

function getCarrierById(id) {
  return carriers.find(c => c.id === id) || null;
}

function getAllCarriers() {
  return carriers;
}

module.exports = { carriers, generateRate, simulateResponse, getCarrierById, getAllCarriers, numberToWords };
