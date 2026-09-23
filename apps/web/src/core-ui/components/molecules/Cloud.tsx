import Image from 'next/image';
import { useTranslation } from 'react-i18next';

export const Cloud1 = ({ className = '' }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <Image src="/world/cloud1.png" alt={t('ui.cloud.alt')} width={400} height={200} className={`${className} object-contain`} />
  );
};

export const Cloud2 = ({ className = '' }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <Image src="/world/cloud2.png" alt={t('ui.cloud.alt')} width={400} height={200} className={`${className} object-contain`} />
  );
};

export const Cloud3 = ({ className = '' }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <Image src="/world/cloud3.png" alt={t('ui.cloud.alt')} width={400} height={200} className={`${className} object-contain`} />
  );
};

export const Cloud4 = ({ className = '' }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <Image src="/world/cloud4.png" alt={t('ui.cloud.alt')} width={400} height={200} className={`${className} object-contain`} />
  );
};
