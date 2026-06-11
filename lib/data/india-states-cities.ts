/**
 * India states/UTs + major cities per state, for the Enquiry form's
 * dependent State → City dropdowns (used when Country = India).
 *
 * The city lists cover capitals + major industrial/commercial centres —
 * Carbide's clients are mostly industrial buyers. The City combobox also
 * accepts free-typed values ("Use ‹typed›"), so a town missing here never
 * blocks an enquiry; this list just makes the common cases two keystrokes.
 */

export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  // Union Territories
  "Andaman & Nicobar Islands",
  "Chandigarh",
  "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

export type IndiaState = (typeof INDIA_STATES)[number];

export const INDIA_CITIES: Record<IndiaState, string[]> = {
  "Andhra Pradesh": [
    "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Rajahmundry",
    "Tirupati", "Kakinada", "Kadapa", "Anantapur", "Eluru", "Ongole", "Srikakulam",
  ],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro"],
  "Assam": [
    "Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tinsukia", "Tezpur", "Bongaigaon",
  ],
  "Bihar": [
    "Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Begusarai", "Arrah",
  ],
  "Chhattisgarh": [
    "Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon", "Raigarh", "Jagdalpur",
  ],
  "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Verna"],
  "Gujarat": [
    "Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar",
    "Junagadh", "Anand", "Bharuch", "Ankleshwar", "Vapi", "Morbi", "Mehsana", "Halol", "Mundra",
  ],
  "Haryana": [
    "Gurugram", "Faridabad", "Panipat", "Ambala", "Yamunanagar", "Rohtak", "Hisar",
    "Karnal", "Sonipat", "Bahadurgarh", "Manesar", "Rewari",
  ],
  "Himachal Pradesh": ["Shimla", "Baddi", "Solan", "Mandi", "Dharamshala", "Una", "Parwanoo", "Nalagarh"],
  "Jharkhand": [
    "Ranchi", "Jamshedpur", "Dhanbad", "Bokaro Steel City", "Deoghar", "Hazaribagh", "Giridih", "Ramgarh",
  ],
  "Karnataka": [
    "Bengaluru", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi", "Ballari",
    "Tumakuru", "Davanagere", "Shivamogga", "Udupi", "Hosur Road", "Peenya", "Bidadi", "Kolar",
  ],
  "Kerala": [
    "Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam", "Ernakulam",
    "Alappuzha", "Palakkad", "Kannur", "Kottayam", "Malappuram",
  ],
  "Madhya Pradesh": [
    "Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Dewas", "Satna", "Ratlam",
    "Pithampur", "Mandideep", "Rewa", "Sagar", "Katni",
  ],
  "Maharashtra": [
    "Mumbai", "Pune", "Nashik", "Nagpur", "Thane", "Aurangabad (Chhatrapati Sambhajinagar)",
    "Solapur", "Kolhapur", "Amravati", "Navi Mumbai", "Sangli", "Jalgaon", "Akola",
    "Ahmednagar", "Satara", "Chakan", "Ranjangaon", "Taloja", "Tarapur", "Ambad MIDC",
    "Sinnar", "Ichalkaranji", "Dhule", "Latur",
  ],
  "Manipur": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur"],
  "Meghalaya": ["Shillong", "Tura", "Byrnihat", "Jowai"],
  "Mizoram": ["Aizawl", "Lunglei", "Champhai"],
  "Nagaland": ["Kohima", "Dimapur", "Mokokchung"],
  "Odisha": [
    "Bhubaneswar", "Cuttack", "Rourkela", "Sambalpur", "Berhampur", "Angul",
    "Jharsuguda", "Paradip", "Balasore", "Kalinganagar",
  ],
  "Punjab": [
    "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali",
    "Mandi Gobindgarh", "Hoshiarpur", "Batala", "Moga", "Khanna",
  ],
  "Rajasthan": [
    "Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Bhilwara",
    "Bhiwadi", "Sikar", "Pali", "Sri Ganganagar", "Neemrana",
  ],
  "Sikkim": ["Gangtok", "Namchi", "Rangpo"],
  "Tamil Nadu": [
    "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli",
    "Tiruppur", "Erode", "Vellore", "Hosur", "Sriperumbudur", "Ambattur",
    "Thoothukudi", "Karur", "Sivakasi", "Rajapalayam", "Dindigul",
  ],
  "Telangana": [
    "Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Secunderabad",
    "Patancheru", "Medchal", "Ramachandrapuram",
  ],
  "Tripura": ["Agartala", "Udaipur (Tripura)", "Dharmanagar"],
  "Uttar Pradesh": [
    "Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj",
    "Noida", "Greater Noida", "Bareilly", "Aligarh", "Moradabad", "Saharanpur",
    "Gorakhpur", "Jhansi", "Mathura", "Firozabad",
  ],
  "Uttarakhand": [
    "Dehradun", "Haridwar", "Rudrapur", "Haldwani", "Roorkee", "Kashipur",
    "Pantnagar", "Sitarganj", "Selaqui",
  ],
  "West Bengal": [
    "Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Haldia", "Kharagpur",
    "Burdwan", "Malda", "Serampore", "Raniganj",
  ],
  "Andaman & Nicobar Islands": ["Port Blair"],
  "Chandigarh": ["Chandigarh"],
  "Dadra & Nagar Haveli and Daman & Diu": ["Silvassa", "Daman", "Diu"],
  "Delhi": [
    "New Delhi", "Delhi", "Okhla", "Narela", "Bawana", "Mayapuri", "Wazirpur",
  ],
  "Jammu & Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Kathua", "Samba"],
  "Ladakh": ["Leh", "Kargil"],
  "Lakshadweep": ["Kavaratti"],
  "Puducherry": ["Puducherry", "Karaikal", "Yanam", "Mahe"],
};

export function citiesForState(state: string): string[] {
  return INDIA_CITIES[state as IndiaState] ?? [];
}

export function isIndiaState(value: string): value is IndiaState {
  return (INDIA_STATES as readonly string[]).includes(value);
}
