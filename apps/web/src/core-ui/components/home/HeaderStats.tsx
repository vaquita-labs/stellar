import { ShopButton } from './ShopButton';
import { StreakButton } from './StreakButton';
import { TotalDepositsButton } from './TotalDepositsButton';

export const HeaderStats = () => {
  return (
    <div className="flex justify-center w-full px-2 bg-primary border-b-1  border-[#B97204] pb-1 overflow-x-hidden rounded-g">
      <div className="max-w-xl flex-1 flex justify-between min-w-0 ">
        <StreakButton />
        <TotalDepositsButton />
        <ShopButton />
      </div>
    </div>
    //
  );
};
