export type ExperienceModalProps = {
  open: boolean;
  onOpenChange: () => void;
  /** Total accumulated experience points shown in the header. */
  experience: number;
};
