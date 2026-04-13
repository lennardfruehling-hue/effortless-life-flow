import { motion } from "framer-motion";

interface PrincipleCardProps {
  title: string;
  description: string;
  index: number;
}

const PrincipleCard = ({ title, description, index }: PrincipleCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.5, delay: index * 0.05 }}
    className="group py-6 border-b border-border last:border-b-0"
  >
    <h3 className="text-xl md:text-2xl mb-2 text-foreground">{title}</h3>
    <p className="text-muted-foreground text-sm md:text-base leading-relaxed font-light max-w-xl">
      {description}
    </p>
  </motion.div>
);

export default PrincipleCard;
