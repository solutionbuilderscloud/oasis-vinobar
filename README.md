# Oasis Vinobar — sistema de gestão

Gestão de uma loja de vinhos: caixa em dólar, real e guarani com o câmbio do dia, estoque, vendas, bonificações e permutas, custos, eventos, equipe, vitrine e consulta de preço para tablets.

Apresentação: https://solutionbuilderscloud.github.io/oasis-vinobar/

O banco e as fotos ficam em `data/`, fora do repositório. `pnpm db:demo` carrega dados de demonstração.

```bash
pnpm install
pnpm db:setup   # cria o banco em data/oasis.db e mostra a senha do admin (uma única vez)
pnpm dev        # http://localhost:3000
pnpm test
```

Mudou `src/db/schema.ts`? Rode `pnpm db:generate` e depois `pnpm db:setup`.

Preços ficam em centavos de dólar. Real e guarani são calculados pelo câmbio em Configurações.
