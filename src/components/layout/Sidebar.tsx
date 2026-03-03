'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  Home, 
  Camera, 
  Users, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  UserCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const menuItems = [
  { href: '/?page=dashboard', label: 'Dashboard', icon: Home, page: 'dashboard' },
  { href: '/?page=attendance', label: 'Absensi', icon: Camera, page: 'attendance' },
  { href: '/?page=students', label: 'Data Siswa', icon: Users, page: 'students' },
  { href: '/?page=statistics', label: 'Statistik', icon: BarChart3, page: 'statistics' },
  { href: '/?page=settings', label: 'Pengaturan', icon: Settings, page: 'settings' },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const searchParams = useSearchParams();
  const currentPage = searchParams.get('page') || 'dashboard';
  const { theme, setTheme } = useTheme();
  const { admin, logout } = useAuth();

  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-full w-64 bg-card border-r z-50 transition-transform duration-300",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <Link href="/?page=dashboard" className="flex items-center gap-2" onClick={closeSidebar}>
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Camera className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">FaceAbsen</span>
            </Link>
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={closeSidebar}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.page;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeSidebar}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t space-y-4">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Mode</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </Button>
            </div>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>
                      {admin?.email?.charAt(0).toUpperCase() || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">Admin</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {admin?.email}
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Akun Saya</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profil
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Pengaturan
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Mobile Header - shown only on mobile */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b z-30 flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <Link href="/?page=dashboard" className="flex items-center gap-2 ml-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Camera className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">FaceAbsen</span>
        </Link>
      </header>
    </>
  );
}
