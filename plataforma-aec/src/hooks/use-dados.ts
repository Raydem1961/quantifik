'use client';
import * as React from 'react';
import { useColecao } from './use-colecao';
import type { Dados, Reg } from '@/lib/indicadores';

/** Todos os registros de obra da empresa, em tempo real (usado no Início e nas páginas de área). */
export function useDados(): Dados {
  const c = (nome: string) => useColecao<Reg>(nome).dados; // eslint-disable-line react-hooks/rules-of-hooks -- chamadas fixas, sempre na mesma ordem
  const works = c('works'), activities = c('activities'), budgets = c('budgets'), measurements = c('measurements'), finance = c('finance');
  const contracts = c('contracts'), orders = c('orders'), inventory = c('inventory'), staff = c('staff'), equipment = c('equipment');
  const quality = c('quality'), safety = c('safety'), documents = c('documents'), suppliers = c('suppliers'), dailyLogs = c('dailyLogs');
  return React.useMemo(
    () => ({ works, activities, budgets, measurements, finance, contracts, orders, inventory, staff, equipment, quality, safety, documents, suppliers, dailyLogs }),
    [works, activities, budgets, measurements, finance, contracts, orders, inventory, staff, equipment, quality, safety, documents, suppliers, dailyLogs],
  );
}
