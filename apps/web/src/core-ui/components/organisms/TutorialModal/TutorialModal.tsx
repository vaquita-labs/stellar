'use client';

import { useIsMobile } from '@/core-ui/hooks';
import { Button, Modal } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isMobile = useIsMobile();

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleNext = () => {
    setCurrentStep(1);
  };

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };
  return (
    <Modal.Backdrop isOpen={isOpen} className="bg-black/80 backdrop-blur-sm" onOpenChange={(o) => { if (!o) handleClose(); }}>
      <Modal.Container size="full">
        <Modal.Dialog className="bg-transparent m-0 p-0">
          <Modal.CloseTrigger>
            <Image src="/icons/close-circle.svg" alt="close" width={52} height={52} className="sm:w-10 sm:h-10" />
          </Modal.CloseTrigger>
          <Modal.Body className="p-0 flex items-center justify-center min-h-screen overflow-y-auto">
          <AnimatePresence mode="wait">
            {currentStep === 0 ? (
              <motion.div
                key="welcome"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                }}
                className="flex flex-col items-center justify-center space-y-6"
              >
                <motion.div
                  animate={{
                    y: [0, -10, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="relative"
                >
                  <Image
                    src="/vaquita/tutorial.png"
                    alt="Vaquita Tutorial"
                    width={200}
                    height={200}
                    className="drop-shadow-2xl"
                  />
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="text-center space-y-4"
                >
                  <h2 className="text-3xl font-bold text-white drop-shadow-lg">Welcome to Vaquita!</h2>
                  <p className="text-lg text-white/90 drop-shadow-md max-w-md">
                    Discover how to grow your savings in a smart and fun way
                  </p>
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                >
                  <Button
                    onPress={handleNext}
                    className="bg-primary text-black font-semibold px-8 py-3 rounded-lg hover:bg-white/90 transition-colors"
                    size="lg"
                  >
                    Next
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="tutorial"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="w-full h-full flex flex-col"
              >
                <div className="flex-1 flex items-center justify-center">
                  {isMobile ? (
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '0.6946502057613169',
                        margin: '0 auto',
                        width: '90%',
                        minHeight: '400px',
                      }}
                    >
                      <iframe
                        src="https://demo.arcade.software/O9a6jqOPv9c9fdKlxjID?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
                        title="Learn how to save with Vaquita mobile"
                        frameBorder="0"
                        loading="lazy"
                        allowFullScreen
                        allow="clipboard-write"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          colorScheme: 'light',
                        }}
                        className="z-1000"
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        position: 'relative',
                        paddingBottom: 'calc(47.85714285714286% + 41px)',
                        height: '0',
                        width: '90%',
                        margin: '0 auto',
                        minHeight: '500px',
                      }}
                    >
                      <iframe
                        src="https://demo.arcade.software/fig4kWFCOkXCO48WunnY?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
                        title="Learn how to save with Vaquita"
                        frameBorder="0"
                        loading="lazy"
                        allowFullScreen
                        allow="clipboard-write"
                        style={{
                          position: 'absolute',
                          top: 0,
                          width: '100%',
                          height: '100%',
                          colorScheme: 'light',
                          borderRadius: '0px',
                        }}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
