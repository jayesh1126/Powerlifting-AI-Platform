// The educators and publications the knowledge base is curated from.
// Mirrors knowledge/seeds.yaml (the ingestion pipeline's discovery list),
// deduplicated across YouTube channels and article sites.

export const KNOWLEDGE_SOURCES = [
  { name: "Stronger by Science", href: "https://www.strongerbyscience.com" },
  {
    name: "Reactive Training Systems",
    href: "https://www.youtube.com/@ReactiveTrainingSystems",
  },
  {
    name: "Juggernaut Training Systems",
    href: "https://www.jtsstrength.com",
  },
  { name: "Barbell Medicine", href: "https://www.barbellmedicine.com" },
  { name: "Jeff Nippard", href: "https://www.youtube.com/@JeffNippard" },
  { name: "PRs Performance", href: "https://www.youtube.com/@PRsPerformance" },
  { name: "The Swolefessor", href: "https://www.youtube.com/@TheSwolefessor" },
  { name: "Gavin Adin", href: "https://www.youtube.com/@GavinAdin" },
  { name: "Yando", href: "https://www.youtube.com/@yando_af" },
  { name: "JFlexFit", href: "https://www.youtube.com/@jflexfit" },
  { name: "Deadlift Lord", href: "https://www.youtube.com/@deadlift_lord868" },
  {
    name: "Strong Ambitions Powerlifting",
    href: "https://www.youtube.com/@strongambitionspowerlifting",
  },
  { name: "P4P Coaching", href: "https://www.youtube.com/@P4PCoaching" },
  { name: "Conor Harris", href: "https://www.youtube.com/@conorharris" },
  { name: "Barbell Rehab", href: "https://barbellrehab.com" },
  {
    name: "Powerlifting Technique",
    href: "https://powerliftingtechnique.com",
  },
] as const;
