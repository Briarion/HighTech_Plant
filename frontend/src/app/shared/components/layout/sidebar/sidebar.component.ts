import { Component, Input, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  children?: MenuItem[];
  badge?: {
    text: string;
    color: string;
  };
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: false
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = false;

  activeRoute = '';
  expandedMenus = new Set<string>();

  menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Главная панель',
      icon: 'dashboard',
      route: '/dashboard'
    },
    {
      id: 'downtimes-scan',
      label: 'Сканирование протоколов',
      icon: 'scan',
      route: '/downtimes/scan'
    },
    {
      id: 'downtimes-list',
      label: 'Список простоев',
      icon: 'list',
      route: '/downtimes'
    },
    {
      id: 'conflicts',
      label: 'Конфликты',
      icon: 'alert',
      route: '/conflicts',
    },
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Отслеживаем изменения маршрута
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.activeRoute = event.urlAfterRedirects;
        this.updateExpandedMenus();
      });

    // Устанавливаем активный маршрут при инициализации
    this.activeRoute = this.router.url;
    this.updateExpandedMenus();

    // Восстанавливаем состояние развёрнутых меню
    const savedExpandedMenus = localStorage.getItem('expandedMenus');
    if (savedExpandedMenus) {
      this.expandedMenus = new Set(JSON.parse(savedExpandedMenus));
    }
  }

  private updateExpandedMenus(): void {
    // Автоматически разворачиваем родительские меню для активного маршрута
    this.menuItems.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => 
          child.route && this.activeRoute.startsWith(child.route)
        );
        if (hasActiveChild) {
          this.expandedMenus.add(item.id);
        }
      }
    });
    this.saveExpandedMenus();
  }

  private saveExpandedMenus(): void {
    localStorage.setItem('expandedMenus', JSON.stringify([...this.expandedMenus]));
  }

  toggleMenu(menuId: string): void {
    if (this.expandedMenus.has(menuId)) {
      this.expandedMenus.delete(menuId);
    } else {
      this.expandedMenus.add(menuId);
    }
    this.saveExpandedMenus();
  }

  isMenuExpanded(menuId: string): boolean {
    return this.expandedMenus.has(menuId);
  }

  isActive(route: string): boolean {
    return this.activeRoute === route || this.activeRoute.startsWith(route + '/');
  }

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}