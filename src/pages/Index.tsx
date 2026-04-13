import { motion } from "framer-motion";
import Section from "@/components/Section";

const sections = [
  {
    label: "The Basics",
    heading: "Start with why.",
    principles: [
      { title: "Know why it's there", description: "Your keys live by the door because that's where you need them. Not on the kitchen counter, not on the sofa." },
      { title: "Keep it simple", description: "One junk drawer is a junk drawer. Ten junk drawers is a lost cause." },
      { title: "Do it the same way every time", description: "Washing goes in the laundry basket. Every time. Not sometimes on the floor." },
      { title: "Make it obvious", description: "If you have to explain where something is, it's in the wrong place." },
    ],
  },
  {
    label: "Where Things Go",
    heading: "Everything has one home.",
    principles: [
      { title: "One home, always", description: "Your passport lives in one place. The moment it 'lives anywhere,' it lives nowhere." },
      { title: "Keep similar things together", description: "Batteries with batteries. Chargers with chargers. Not one in the kitchen, one in the bedroom, one in the car." },
      { title: "Don't make it too deep", description: "If you need to open four drawers to find a pen, something has gone wrong." },
    ],
  },
  {
    label: "Easy to Use",
    heading: "You shouldn't have to think.",
    principles: [
      { title: "Frequency equals accessibility", description: "Coffee mugs at the front of the cupboard. The fancy china at the back." },
      { title: "Zero thought required", description: "If finding your keys requires thinking, the system is broken." },
      { title: "Effortless put-away", description: "If it's easier to drop it on the floor than put it away, it'll end up on the floor." },
      { title: "Anyone should understand it", description: "If a houseguest can't find a glass without asking, your cupboards need rethinking." },
    ],
  },
  {
    label: "Being Smart",
    heading: "Think ahead.",
    principles: [
      { title: "Leave room to grow", description: "Don't fill your wardrobe completely. You'll buy new clothes." },
      { title: "Know what matters most", description: "Your child's medical records need to be findable in 30 seconds. Old bank statements from 2011 do not." },
    ],
  },
  {
    label: "Keeping It Honest",
    heading: "One source of truth.",
    principles: [
      { title: "Don't keep two versions", description: "One shopping list. Not one on your phone, one on the fridge, one on a scrap of paper." },
      { title: "Trust it completely", description: "If you're not sure whether the system is right, you'll double-check everything — and the system becomes pointless." },
    ],
  },
  {
    label: "When Things Go Wrong",
    heading: "Make mistakes cheap.",
    principles: [
      { title: "Easy to fix", description: "A label maker is great until you label something wrong. Make sure you can peel the label off." },
      { title: "Contain the damage", description: "One overflowing inbox shouldn't mean you miss an important bill." },
    ],
  },
  {
    label: "Growing & Changing",
    heading: "Systems that scale.",
    principles: [
      { title: "It should still work with more", description: "A filing system that works for 20 documents should still work for 200." },
      { title: "Tidy up now and then", description: "Even the best wardrobe needs a clear-out once a year." },
    ],
  },
  {
    label: "People Stuff",
    heading: "Work with your brain.",
    principles: [
      { title: "Follow your habits", description: "If you always put your phone on the left side of the bed, that's where the charger should be." },
      { title: "Make the right thing easy", description: "If the recycling bin is right next to the bin, you'll recycle. If it's in the garage, you won't." },
      { title: "Mistakes shouldn't be catastrophic", description: "Knocking something off a shelf shouldn't mean an hour of reorganising." },
    ],
  },
];

const Index = () => (
  <div className="min-h-screen bg-background">
    {/* Hero */}
    <header className="px-6 md:px-12 lg:px-24 pt-24 md:pt-40 pb-16 md:pb-24 max-w-5xl mx-auto">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="text-xs font-medium tracking-widest uppercase text-muted-foreground mb-6"
      >
        A guide to living well
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1 }}
        className="text-5xl md:text-7xl lg:text-8xl leading-[0.95] text-foreground max-w-3xl"
      >
        The art of <br />
        <em className="text-accent">effortless</em> <br />
        organization
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="mt-8 text-muted-foreground text-lg md:text-xl font-light max-w-lg leading-relaxed"
      >
        The best system is the one you forget is even there — because everything is just always where you expect it to be.
      </motion.p>
    </header>

    {/* Divider */}
    <div className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto">
      <div className="h-px bg-border" />
    </div>

    {/* Sections */}
    <main className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto divide-y divide-border">
      {sections.map((section, i) => (
        <Section
          key={i}
          label={section.label}
          heading={section.heading}
          principles={section.principles}
          index={i}
        />
      ))}
    </main>

    {/* Footer */}
    <footer className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto py-24 text-center">
      <p className="font-serif text-2xl md:text-3xl text-foreground italic max-w-md mx-auto leading-snug">
        Organization isn't about being tidy. It's about making life easier without thinking.
      </p>
      <div className="mt-8 h-px w-16 bg-accent mx-auto" />
    </footer>
  </div>
);

export default Index;
