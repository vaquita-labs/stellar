'use client';

import { Avatar, Badge, Button, Card, Tooltip } from '@heroui/react';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiCopy, FiEdit3 } from 'react-icons/fi';
import { truncateMiddle } from '../../helpers';
import { useProfileData } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { EditProfileModal } from '../organisms';

export function ProfilePage() {
  const { walletAddress } = useNetworkConfigStore();
  const { data, isLoading } = useProfileData();
  const profileNickname = data?.nickname ?? '';
  const [nickname, setNickname] = useState<string>('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    setNickname(profileNickname);
  }, [profileNickname]);

  const [copied, setCopied] = useState(false);

  const addressDisplay = useMemo(() => (walletAddress ? truncateMiddle(walletAddress, 8, 6) : ''), [walletAddress]);

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // no-op; could add error toast if you use one globally
    }
  };

  const handleEditSuccess = (nickname: string) => {
    setNickname(nickname);
  };

  return (
    <div className="bg-background">
      {walletAddress ? (
        <div className="mx-auto w-full max-w-4xl px-4 py-4 md:py-6">
          {/* Profile Header */}
          <Card className=" shadow-xl border border-default-200 rounded-3xl mb-4 bg-white/80 backdrop-blur-sm">
            <Card.Content className="p-4 md:p-8">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0 ">
                  <Badge color="success" placement="bottom-right">
                    <Badge.Anchor>
                      <Avatar className="w-16 h-16 md:w-20 md:h-20 border-2 border-white shadow-md">
                        <Avatar.Image src="/vaquita_working.jpg" />
                        <Avatar.Fallback>
                          {(isLoading ? 'Loading...' : nickname || 'Vaquita').slice(0, 2).toUpperCase()}
                        </Avatar.Fallback>
                      </Avatar>
                    </Badge.Anchor>
                    <Badge.Label className="w-3 h-3 bg-green-500 border border-white" />
                  </Badge>
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate">
                    {isLoading ? 'Loading...' : nickname || 'Guest'}
                  </h1>
                  {walletAddress && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Tooltip>
                        <Tooltip.Trigger>
                          <Button
                            variant="ghost"
                            onPress={handleCopy}
                            className="text-xs text-gray-500 hover:text-gray-700 transition-colors p-1 h-auto min-w-0 flex-shrink-0 inline-flex items-center gap-2"
                          >
                            {copied ? <FiCheck className="text-green-500" /> : <FiCopy />}
                            {addressDisplay}
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content placement="bottom">
                          {copied ? '¡Copiado!' : 'Copiar dirección'}
                        </Tooltip.Content>
                      </Tooltip>
                      <Button
                        variant="outline"
                        onPress={() => setIsEditModalOpen(true)}
                        className="border border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-all text-xs px-2 py-1 h-auto flex-shrink-0 inline-flex items-center gap-2"
                        size="sm"
                        isDisabled={isLoading}
                      >
                        <FiEdit3 />
                        Editar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card.Content>
          </Card>

          {/* Social Links */}
          {walletAddress && (
            <Card className="shadow-lg border border-default-200 rounded-2xl bg-white backdrop-blur-sm">
              <Card.Content className="p-4 md:p-8">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">Follow us</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 md:gap-4 gap-2">
                  <Link
                    href="https://x.com/VaquitaProtocol"
                    target="_blank"
                    className="flex items-center justify-center gap-3 p-4 rounded-xl bg-black text-white hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </Link>
                  <Link
                    href="https://t.me/vaquitaprotocol"
                    target="_blank"
                    className="flex items-center justify-center gap-3 p-4 rounded-xl bg-[#0088cc] text-white hover:bg-[#0077b3] transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </Link>
                </div>
              </Card.Content>
            </Card>
          )}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-4xl px-4 py-4 md:py-6">
          <Card className="shadow-xl border border-default-200 rounded-3xl mb-4 bg-white backdrop-blur-sm">
            <Card.Content className="p-8  md:p-12">
              <div className="text-center space-y-6">
                {/* Title */}
                <div className="">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Connect Your Wallet</h1>
                </div>

                {/* CTA */}
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    By connecting, you agree to our Terms of Service and Privacy Policy
                  </p>
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>
      )}

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentNickname={nickname}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
