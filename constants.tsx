
import { AppItem } from './types';

export const APPS: AppItem[] = [
  {
    id: 'roblox-part',
    name: 'Roblox',
    description: 'Nền tảng blog, chia sẻ và cập nhật mọi thông tin mới nhất về thế giới Roblox.',
    icon: 'fa-gamepad',
    category: 'Core',
    url: '/community?tab=roblox',
    color: 'bg-red-600',
    developer: 'TIG-Minh'
  },
  {
    id: 'gtd-part',
    name: 'Gold Tower Defense',
    description: 'Blog chiến thuật, đội hình và cộng đồng Gold Tower Defense chuyên nghiệp.',
    icon: 'fa-shield-halved',
    category: 'Core',
    url: '/community?tab=gtd',
    color: 'bg-amber-500',
    developer: 'TIG-Minh'
  },
  {
    id: 'ehw-part',
    name: 'EHW',
    description: 'Cộng đồng game thủ EHW - Nơi chia sẻ kinh nghiệm, chiến thuật và cập nhật những sự kiện mới nhất từ thế giới game EHW.',
    icon: 'fa-sword',
    category: 'Core',
    url: '/community?tab=ehw',
    color: 'bg-emerald-600',
    developer: 'TIG-Minh'
  }
];
