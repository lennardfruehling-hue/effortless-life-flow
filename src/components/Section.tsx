import { motion } from "framer-motion";
import PrincipleCard from "./PrincipleCard";

interface Principle {
  title: string;
  description: string;
}

interface SectionProps {
  label: string;
  heading: string;
  principles: Principle[];
  index: number;
}

const Section = ({ label, heading, principles, index }: SectionProps) => (
  <motion.section
    initial={{ opacity: 0 }}
    whileInView={{ opacity: 1 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.6 }}
    className="py-16 md:py-24"
  >
    <div className="flex items-baseline gap-4 mb-8">
      <span className="text-xs font-medium tracking-widest uppercase text-accent">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
        {label}
      </span>
    </div>
    <h2 className="text-3xl md:text-5xl mb-12 text-foreground leading-tight max-w-lg">
      {heading}
    </h2>
    <div>
      {principles.map((p, i) => (
        <PrincipleCard key={i} title={p.title} description={p.description} index={i} />
      ))}
    </div>
  </motion.section>
);

export default Section;
