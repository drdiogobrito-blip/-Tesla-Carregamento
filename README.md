# Tesla Charging Finder Lisboa (V1)

Compara quanto custa carregar um Tesla em PRIO, Via Verde e miio, com tarifas escritas à mão.

## Correr localmente
```
npm install
npm run dev      # abre http://localhost:3000
npm test         # testes unitários
```

## Preencher preços
Edita `data/tariffs.json`. Cada entrada tem:
`operator`, `station` (posto/zona), `type` ("AC" ou "DC"), `eurPerKwh`, `activationFeeEur`,
`perMinuteFeeEur`, `priceDate` ("AAAA-MM-DD"), `source` (de onde tiraste o preço).

- `eurPerKwh: null` => aparece "Tarifa não confirmada" e não entra na comparação.
- `activationFeeEur` / `perMinuteFeeEur` a `null` contam como 0 (sem taxa).
- Se `perMinuteFeeEur` > 0, tens de indicar os minutos de carga no ecrã Simular.
- Para ter vários postos do mesmo operador, copia o bloco e muda `station` e `type`.
