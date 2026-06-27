# Diseño: Filtros de Inventario (Chips)

## Descripción
Agregar un menú de filtros debajo de la barra de búsqueda en el módulo de inventario (\TablaInventario.tsx\), usando un diseño de "Chips" (botones accionables).

## Componentes UI
- Un contenedor flex que se ubicará debajo del input de búsqueda.
- Botones estilo chip con estados activo/inactivo (cambio de color de fondo/texto).
- Filtros disponibles:
  - Activos
  - Inactivos
  - Solo Bs
  - Solo \$
  - Stock Bajo

## Lógica de Negocio
- **Estado Activo/Inactivo:** Se manejará con un estado \iltroEstado\ que puede ser \'todos' | 'activos' | 'inactivos'\.
- **Estado Moneda:** Se manejará con un estado \iltroMoneda\ que puede ser \'todos' | 'BS' | 'USD'\.
- **Estado Stock:** Se mantiene el toggle actual, pero movido a este grupo de chips como un botón más.
- Al hacer clic en un filtro, se alternará (toggle). Si tocas "Solo Bs" cambia a \'BS'\. Si lo vuelves a tocar, cambia a \'todos'\. Si tocas "Solo \$" mientras está en "Solo Bs", cambia a \'USD'\.
- El filtro de búsqueda por texto (nombre/SKU) sigue funcionando conjuntamente.

## Consideraciones de UI
- Los chips deben tener un aspecto redondeado y claro, usando los colores definidos del sistema (\ar(--bg3)\ para inactivo, \ar(--accent)\ para activo).
