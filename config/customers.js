// Customer profiles with markup rules and carrier preferences.

const customers = {
  WOOF_PET: {
    id: 'WOOF_PET',
    name: 'Woof Pet Inc',
    contact_name: 'Chase Jackson',
    contact_email: 'chase@mywoof.com',
    markup_percent: 12,
    preferred_carriers: [],        // no preference
    excluded_carriers: [],         // none excluded
    payment_terms: 'signature'
  },
  SILVERTS: {
    id: 'SILVERTS',
    name: "Silvert's Adaptive Clothing",
    contact_name: 'Kaitlyn McConnell',
    contact_email: 'kaitlyn@silverts.com',
    markup_percent: 8,
    preferred_carriers: ['SMARTEFREIGHT'],  // prefers SmarteFreight
    excluded_carriers: [],
    payment_terms: 'net30'
  },
  TECHGEAR: {
    id: 'TECHGEAR',
    name: 'TechGear Direct',
    contact_name: 'Mike Chen',
    contact_email: 'mike@techgeardirect.com',
    markup_percent: 15,
    preferred_carriers: [],
    excluded_carriers: ['XPO'],    // refuses XPO
    payment_terms: 'credit_card'
  },
  FRESHBOX: {
    id: 'FRESHBOX',
    name: 'FreshBox Organics',
    contact_name: 'Sarah Palmer',
    contact_email: 'sarah@freshboxorganics.com',
    markup_percent: 5,             // large volume, low markup
    preferred_carriers: ['AMAZON_FREIGHT'],  // only wants Amazon Freight
    excluded_carriers: [],
    payment_terms: 'net30'
  }
};

function getCustomerById(id) {
  return customers[id] || null;
}

function getAllCustomers() {
  return Object.values(customers);
}

module.exports = { customers, getCustomerById, getAllCustomers };
