'use client';

import { getCurrentDay } from '@/core-ui/helpers';
import { useProfileStreak } from '@/core-ui/hooks';
import { Button, Modal } from '@heroui/react';
import Image from 'next/image';
import { ONE_DAY } from '../../../config/constants';
import { StreakModalProps } from './types';

const DATES_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function StreakModal({ open, onOpenChange }: StreakModalProps) {
  const { data } = useProfileStreak();
  const streakFreeze = { used: 0, total: 1 };
  const streakRepair = { canRestoreTo: 1, cost: 0 };

  const currentStreak = (data?.yesterdayStreak || 0) + (data?.todayStreak ? 1 : 0);

  const weeklyProgress = [];
  let day = getCurrentDay(new Date()) - 5;
  const todayDay = getCurrentDay(new Date());
  for (let i = 0; i < 7; i++) {
    const date = new Date(day * ONE_DAY);
    weeklyProgress.push({
      day: DATES_ABBR[date.getDay()] || '',
      completed: data?.days?.includes(day),
      future: day > todayDay,
      isToday: day === todayDay,
      init: day,
    });
    day++;
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(o) => { if (!o) onOpenChange(); }}>
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog className="bg-background border border-black max-h-[90vh]">
          <Modal.CloseTrigger>
            <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
          </Modal.CloseTrigger>
          <Modal.Header>
            <Modal.Heading className="text-black font-bold text-xl">Streak</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-0 max-h-[60vh] overflow-y-auto">
          <div className="space-y-6 mb-4">
            {/* Streak Status Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Image src={'/icons/summary/streak.png'} alt={'streak'} width={32} height={32} />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-black">Current Streak: {currentStreak} days</h2>
                <p className="text-sm text-gray-600">
                  Your streak represents consecutive days of activity. Keep it going to unlock rewards and special tiles for your map!
                </p>
              </div>
            </div>

            {/* Weekly Progress Section */}
            <div className="space-y-3 border border-black border-b-2 rounded-md p-4 bg-white">
              <h3 className="font-bold text-black text-sm mb-2">Weekly Progress</h3>
              <div className="flex justify-between items-center">
                {weeklyProgress.map(({ future, completed, day, isToday }, index) => (
                  <div key={index} className="flex flex-col items-center gap-2">
                    <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-gray-600'}`}>{day}</span>
                    {future ? (
                      <div className="w-6 h-6 rounded-full bg-gray-200 border border-gray-300" />
                    ) : (
                      <Image
                        src="/icons/summary/streak.png"
                        alt="streak"
                        width={24}
                        height={24}
                        className="w-6 h-6"
                        style={completed ? {} : { filter: 'grayscale(100%)' }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 text-center mt-3">
                Get a new tile every time you increase your streak! The colored icons show days you&apos;ve completed, while gray icons indicate missed days.
              </p>
            </div>

            {/* Streak Freeze Section */}
            <div className="space-y-3">
              <h3 className="font-bold text-black text-sm">Streak Freeze</h3>
              <div className="border border-black border-b-2 rounded-md p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black font-semibold">
                    Available: {streakFreeze.total - streakFreeze.used}/{streakFreeze.total}
                  </span>
                  <Image
                    src="/icons/summary/streak_freeze.png"
                    alt="freeze"
                    width={24}
                    height={24}
                    className="w-6 h-6"
                  />
                </div>
                <p className="text-xs text-gray-600">
                  Streak Freeze allows you to protect your streak for one day if you&apos;re unable to maintain it. Use it wisely to prevent losing your progress!
                </p>
              </div>
            </div>

            {/* Streak Repair Section */}
            <div className="space-y-3">
              <h3 className="font-bold text-black text-sm">Streak Repair</h3>
              <div className="border border-black border-b-2 rounded-md p-4 bg-white space-y-3">
                <p className="text-sm text-black">
                  If you&apos;ve lost your streak, you can restore it back to <span className="font-semibold">{streakRepair.canRestoreTo} days</span>
                  <Image
                    src="/icons/summary/streak.png"
                    alt="streak"
                    width={16}
                    height={16}
                    className="inline-block ml-1 w-4 h-4"
                  />
                  using Streak Repair.
                </p>
                <div className="text-sm text-gray-600 space-y-2">
                  <div>
                    <span className="font-semibold text-black">Cost:</span>
                    <div className="flex items-center gap-1 mt-1">
                      <span>{streakRepair.cost}</span>
                      <Image src="/icons/summary/streak.png" alt="streak" width={16} height={16} className="w-4 h-4" />
                      <span className="text-purple-600">+ 1</span>
                      <Image src="/icons/summary/streak.png" alt="streak" width={16} height={16} className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    This feature helps you recover from a broken streak, but remember: maintaining your streak daily is the best way to maximize your rewards!
                  </p>
                </div>
                <Button
                  className="w-full bg-transparent border border-black border-b-2 text-black font-semibold rounded-md hover:bg-gray-100"
                  size="lg"
                >
                  Repair streak
                </Button>
              </div>
            </div>
          </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
