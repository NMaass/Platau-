/* Plateau extra screens: trades, free agents, offers, scouting, draft, standings, playoffs, schedule, history, battle.
   Plain JS. Inlined into the prototype's main script after its helpers and data; uses them when present
   (esc, ic, SPR, MONS, bestRole, ROLE_ABBR, CAP, USED, OPP, STRATS, S, lineup, BY, gchip, nameLink, money) and falls back otherwise.
   Exposes only window.EXTRA_ROUTES. All markup uses the l-* layout layer from plateau-tokens.css; .x-* lives in screens.css. */
(function(){
"use strict";
const XSPR={"Clefable":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJaUjF7YzGta1K9vb3OjGvmhHP/tZT////xhlOFAAAAAXRSTlMAQObYZgAAALVJREFUKJG9zz0OwjAMBWDnBg1/VUaQohA2joDEBUBCoceolyhjBw5AEYrMzsAtSZhq0oGJN37Ks2OA/0ZUIzgbxd0ITtvPAMkKtVfXZHuGAmOQ8rbl27GxsaGWY1hRCm+LR7a+G6qat/QKUZ+74XJ7JxVofRm+FJZOkQjZS1B5ZEQ2M2NPDg2/iMhqj47/KaEvMBAabw78otqnaH4mTEzRBlgcnUfJDYTUbglFNs+qRPFd/iVv/Kgy70Vp/ToAAAAASUVORK5CYII=","front":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgBAMAAAAQtmoLAAAALVBMVEUAAAAQEBBSMUpSQTl7amKDg4OLSlK9WnvVe4vVe6TeOVreYmLulJT/xbT///8YpPrnAAAAAXRSTlMAQObYZgAAAlZJREFUWMPtlrFunEAQhjlHcuOGdSQfhU+60FwiNznhMl14hpQRbjaJYhoXpr8iQkqXItG+gh8gDUdB4+aG4hTrGjPpXMbPkFmWs7mzGXAXRfwSWor/45/ZXRYsq1evXr3+YXmvn+YfeI8Rz6YM4D8kvOO3diPx/Nj3AhqTn3L9eM/3OcBDXEkrwQIMkaTo+1OmiTdI+kxXSewldHfl2UzbhzlZrjUFENDjSb+m7DwBWVIkawH6lqLYABORXuuQyg9TfikOoQQwxMqf2S1rBzmVlOJp5Qe7bbUpQjddAsUcMt69KylCB8iyg2JBAbtSNgOvlAyOEC8l5CVwmVnyk1LjRmBHqe9HeDelCAdSKfWNqWmiVIiF9pYRMIzIP2aAnck5TesfxN9mubMoOuP8Un4gIBwhLldlE1nkss+ngrcBSQoaCVf9oCW+76GAoeK7diO9J4QQI7wH2KpcDawuLqq9NB9GrsuutSx90gyEDqNzfm/glpZRFHD+cBvA/ckZAzz043L2srHngaimdENO3AiM8keA1dJpTlifGGst6AqLbNYI5FtAcaI3oNMIWCNcig0ABL17DDAQ9qAOABBxEs/YUyPfBDLhdAcKDcQfWwDYCOgC5PWAEhjzANQDwPkS8wCdfHnN3wkwGVABLS0YoKaDuB1Y1AGnrSLddWK8uqws7gKAlKaRQgMzqx3QSLgGxu1flHK9vpqztTVgC3DaA0xNd4BrdQPsF3Gqe9jv8hP07lTSp01oIOv01/T+5lbQsJcmHYGBEOVwczu3radIGLBXr17/t/4CV6uBg836CH8AAAAASUVORK5CYII="},"Weavile":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJra4yMjKWUUkq9vb3WUmP3e4T31kL////Rb8TrAAAAAXRSTlMAQObYZgAAALxJREFUKM/NkbEKwjAQhpM3yBXbiptppmwmgnPrIehYBLt2cXCrUDI7FO4B+gK6CD6lq7m6uHnjx3/c//8nxF+MBJiylIYJnQ80kGLC0FBDN6bMa2qoV+yM0RRODFZodB+6TwaAuDY6Xk9rHBEx9iSTw4hVyb3vcfXa8FCz7fPh+PnEew95FytTbXUnmU/XX09Hlj3zEGpTRlSeW5GYareMYKukQ3e5R1CJrIDCWt4oSLSgePkLC99e9/u737SUIe62H8d1AAAAAElFTkSuQmCC"},"Scizor":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTFSUlJ7e3ucnLW9QjG9vb3WY0LvjHP/taX/xSn////vMn5VAAAAAXRSTlMAQObYZgAAAOtJREFUKFONzzFOw0AQBdA/N5gp1nZw5Y2sNS0F1Ei5AJZyADfu19FqLTqQ0G7S0UFLQ02dy1HZeBUr4pdP/480wJXQGpb8b+xwyWVH7xeY3W5eVrB5FYbwLCKgj7iPLOefyejzjSmGaOm8e5xwE4MtYgxVueu7CYvwXDfh5M2h7+ebhbS1Od0M7X0/r0FQrfhvYwZd4U+dQLRTeozzHBCA2icyX8fkA2LFyPUx+ZVsLch9TFEftOR6TOZqezdYcg0vi2774CqILIuFU8HulzUAypJnZVPMGALl06oAAI0pAgDIrSCyNaQ1vJpf3YQuxyQbKYcAAAAASUVORK5CYII="},"Heatran":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJ7e3OMSjqcnJy1Yzq9vb3ehDH/pTH///8xEthqAAAAAXRSTlMAQObYZgAAAOtJREFUGBnVwcFKw0AUBdA7f/BeprHgLjM2se6aWALuElp025Hgvsij2zqU+YEiZF9E/1aNmLbZufQc/DfMGFDMpWcCGEdxc+eDqZifCT3tSu93Rt6F0FPalyGE6atUOBqH4INPpa3QYxt8XphWJMEv3k+L4tJs3kTWjB/K1c7cfDipJRUhdFRjcrfLXuT+ylwcCJ2omZv8ybr0UCdqSeiMJnO2Jrdpuyb9uEJntK+g88KaTUZxkxC+qIYbUtrmmSkpul6u8I3BgOJiEvxMLZhwgqMQKj3DOVXeLphwLl48ZFsMqPGWCUNM+KNPhHUvASq7ODAAAAAASUVORK5CYII="},"Tornadus-Therian":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAKlBMVEUxMTExMTFSUlJjnEpztVKESr2EYzqEhISEzlqcY969vb3FnFr/1lr////laj/lAAAAAXRSTlMAQObYZgAAATpJREFUGBmdwc1KAlEYBuD3u4PvJELHnIVjQbprBqEgN+WmpdGiFl5E1zAJZ9NiRgTP0lUw4B24iwizzUxQKHz3Unb86WcR9Dz4EynGhgIYgLYx1igGZQBZaxkrusL0xiC7Z9tYKUrmCYNsYmMsUUdE5grQyXOf4VAnlZm1DNJjy3CoOZr1zxUAmliGU4jm/c4QC+UJw9k23Ytozviw88BwvOj+0NQzQKEcwyE5nt7eJBlI1LRNjAWS1yeRHqMk+Zg9xidPRMJAoXRXe7zO4FCeN198o9JRXpcMjq5Ww8CYyE9FhOHoo164b4w580eSMpziVf+0NjCmm6SpwhI1Lk+sNSaql4ZYK5jIHxjTiImxtrXbavmmETM2KAkqYehXGF+Q1qyq4QG+UQQUQsZPlARt/ERaK/yiCP/wDq0vY2KLHAnEAAAAAElFTkSuQmCC"},"Bisharp":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJra2uMOjq9Skq9vb3FjEL3jIz39yn///9iXZ7AAAAAAXRSTlMAQObYZgAAAMxJREFUKFO9zjsKwkAQxvFvbjDxBW5nREE7d0/g6wAJjn3Qys6AhfYeQLFJuSoRckoLm330fuWP/8AA/x0BxCEqRv8W4ZGpClN1PvbTGKu7ZDGOrhKk9KlGsonwLrKc+QhVysqE2HoOniFSbi5DzQHKpEwnc0+53SmH+uF9SraghdEnmbt4sGjt0vXCPae6gDLjVzIgBxumXDcz9JTTKu5OzfjNqnaQ0M11s856BwcB2icryajxUBXobJmsa0gYVFt4IQCQ9bvfOOrcfQGERCn5VMSqegAAAABJRU5ErkJggg=="},"Starmie":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJ1BMVEUxMTExMTFSUlJjWpRrY717e86lnM69WkrFvVL3Y1L3rZz39yn////2oiAYAAAAAXRSTlMAQObYZgAAAKJJREFUKM9jYBi+gFEAi5CYI4agsCFQUBBd0CgkVNAY1QRGJaOUUGU0QbEQJaXQICVU/aJpSR2qSmFpKEqFwpR2K6WluSALMjo57dixW80lEMUeF6VNSjuUQhVRzBTq1jquvUMJxXpGo26dk9o7lI0NkQWNldSnayg5oQgyCAY1KXWoOimiOIkxVKhDKTQELaAEGTuUBUMFMMMJI5SwBjJhAADtqx3b3aaIeQAAAABJRU5ErkJggg=="},"Kingdra":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAALVBMVEUxMTExMTFCY7VKjMVSUlJrteaM1v+Uxc6tKSmtezrF7/fWlELve3v/xSn////VfIU5AAAAAXRSTlMAQObYZgAAAKlJREFUKM9jYKAlEMAixpiIVZCRQRBDMFhMMAzdCMZAsVAMlaICohhiDEKOIZj2i4aEBKIrZQxTDQ1KQ1PLmBpqqormVEbR4JjHoYZoYqmmEk/RbBJOCwUCRwZGZGFGQcHQEK91AsKoBjAIOpm8c7RCd6qwqYvycnQ32YaGWBWiu/7uVJPyheiCO3cbCxqjmym701gAM5SlXQyxRIgJNkFjLIIMggIkpwsAsw4clv/Lw2QAAAAASUVORK5CYII="},"Ninetales":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFSUlKllEqtSinWxVrenErmSin35oz///+BZfUzAAAAAXRSTlMAQObYZgAAANBJREFUKFO9kcEJwzAMRaUN4hpKrrFRyTnB4AU6QGQE6QLZoAMkplQjdNweY6c99NR/fPz/kfgA/5b5xtZPhq8GAGs3tiuAsdqUsO1XwBh1KqnV0NgccyyasX+woW0eddytqNJ7YqEUux1Kyp5YiLXI25C3gYVcnnbY3u7qmIVS2fm8zhuRk7DDVh8smYl9kT7JQCKBiYvj0RiRJOK0cALgPCdKrIfvYyAWquEpBD8oSQXR8djrpeoEHNgt21IZwfpp6c6HoQx1pvkYz9TJH/UGo1AwCQ1Kv4IAAAAASUVORK5CYII="},"Amoonguss":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFSUlKEa1qtpZzOzr3WWmvW1tbve6X///+9eRjQAAAAAXRSTlMAQObYZgAAALpJREFUKM/NzjEOgkAQBVD2BqzIAYSGdjMuoVXgALqMiTXBcAAvgJjNtCYc2N1uBxpLf/kyk/+j6C8ipdwaYi03BgAlV6GN7oDmOMQEzRGBSIWYYgdQkZ3C7xZNST7Bv3DVlR3HNQJ5syH66of77sP6HYC764ENFVnuxis+fg+ZC5vudurD0jRrNMX7s5wkY3F90f15pomdytEiFnPFT28DYg6GY4uIqdG8K2mxVnjh/SIBFfN2rxv5JV9Fby8TPfWj1AAAAABJRU5ErkJggg=="},"Landorus-Therian":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAALVBMVEUxMTExMTFSUlJzc3N7WjqUc1K1tbXFnFrOexnWMTrW1tb/a3P/pSn/1lr///+sodamAAAAAXRSTlMAQObYZgAAATZJREFUKFONkTFLw0AUx/O+wZ2kIgYKprRECBn8Bk4OTg43lE5x6FDBT6CDmURCwEyCe4duppMkOMQlkIdrly4NJYvlfQYvqHfBLP6nez/+//fu7hmGFnBmdGSljx0G52nCO3D8KibsD+wJISYvuub8B441BKo5ZyCOTBGrfJ+kfCb5UCjrYdXQjTztCXWrfdcbSCobm+JUOd1k+U1hqHpCGMdL26MpM3oqDuswjNGr5214sEYMi9F0weDiNw67M7zBfDafMVBzgD5uVxiNFpd3pp7Tp+3qgQYnx4kyyhdF10RViGWmjBI6UUUuvmPG9IdC7jl2mQXPBd9oiPk9lk+OF5DOW0XAwzKwiWoFYZcSszCo3sjX6aaw0si3rnQarE8GhMSgvUy5IunW/Vruzs4bd8f4D30BkHN2GX5M4AAAAAAASUVORK5CYII="},"Tapu Lele":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAKlBMVEUhISEhISFKrZxSUlJjY2NzY0KM3sWlUmu1lFq9vcXFe6XvY3v3pcX///+wGvpnAAAAAXRSTlMAQObYZgAAANpJREFUKM9jYKAWEMQixnhGAFNQNmYhpsLQNQcxBEWvnkHXzyhoezPmDJpS8c2T78YcNkZVKl1saWxsORFNu7XyzJmTpVGdyrhZxDjZfPduFFFpcxEnoc27q22QTZU2nAIUtN68CkmQcbeAsMvlzcXGKILbN8oaG2+ebrUYRXDzZd/L2y2LUbwvbXLFxHm3bRWK6xmPXNlsjCF41Hf25mrzU6iCS6f4XjaOWYXqedHOycahW9GCWSoy9OhWdEHGpVFLQ0PRY0ly6tKthRhxJLoqEDM6GQUFSE8rAENZQ+kO5kADAAAAAElFTkSuQmCC"},"Kartana":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFSUlJra2utYym9nELOzs73hFL/3kL///8b+O9jAAAAAXRSTlMAQObYZgAAAPZJREFUGBl9wc1Kw0AUBtDve4N7FWvmMUqknTxB6bKIkK1EilmGLrIOJZIu40DsfVv/2iZjwXPwH8E19gAUMZooB0HMae1KQcyFOuvxx23YmWBKgftsHSpM0Avrh5dlhQm2DZfrcjUHBRfJhuF4CD3uGlww1/D6lvXscsEZW3GLwiR5ajBKNm6Rmbad4ERV2GbBQpsrzpw9q39crX2uuJiZWerrXdtgRDPzIfX5XL8Jfqi60Pk0Pezti+CEeuN9d8zMrMeIRZqqzswEI1cO7wKqYsINZagQ47ZyNkeMW+FQCCL8EMxKQYQ9QBPEBOBWcM0JrlHw6xM0tj9KAXFF+AAAAABJRU5ErkJggg=="},"Magnezone":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJrlJyEhHOlxf+9pUK9vb3eUkL39yn///+XSzn2AAAAAXRSTlMAQObYZgAAANpJREFUKM+1kr0OgjAQx9s36AlodOOAkLgJISZuNiTsJfcAPgKG5N7B0cHEVQcNTykuhVAWBzv+0v9H7k6Ifz4JM3B5Uy5c35WrdX8uWMnTVLtqBDhQlnC+TuIhMV0bt0rA4CuzLu2YuZEcWuhtNylzW52haiwM0ofpYZugHuSeyWpkRkPhqGVh6jci7V+1GvpgEb0vT9puclvL12ViDl1B+Mp2FmIJhDlFNSYWylirgHpPosFT+KGQAVEW5aN0qb7DA1+jO+c+0IULHYfu6sr4OANhZnfw8118AOIPKndBgHuNAAAAAElFTkSuQmCC"},"Jirachi":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTFSUlJrrZyljDG1ta3OvTrm5ub/93NHZIr0AAAAAXRSTlMAQObYZgAAAKRJREFUKM/V0LEKgzAQBuDEJ0hDGztqAiZz36BQJGsn54iErBUks1Dkf+yuPQ3de+PH/cfdMfZ3dSoY38QRpTsiNy4c7Gzcujc1Gfem+UrFpOFpq2ljAgCylWlUjx4gA0wb60dOQPuFmk82196PN3pjztbfJUVW2zyLaodyWHSQDY1HPSxdIOvzOL6yndNKVAVxeXYAOYoLxsV1Q+F9KH2/ZD/rA/RHINQy7OTmAAAAAElFTkSuQmCC"},"Zapdos":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTFSUlJjY1qMhErFrUrmjCn35in///9OUNlsAAAAAXRSTlMAQObYZgAAALlJREFUKFPNUTsOwjAMtW8QVwqZsVVlbnIDbkAkxA26Nyp6OxL3ZqJ1xcrAG5/1PraJ/hIsJN/kTaIQEQfPxqYlEKfgBdyKBUpZFscNanWiCFyd+mZWNSTgvLtybLX0aQDgojhabmMHDs14wIjcz3RAArpaEfF64AJYrdWTeX1Cay3qXYfr69GsWHZZPGesWUsvrtVpjutdoNC2RfEs3IUiFPv2JyESIk5L2tUfc144uUNtU/7+wW/wBtcWJONi1I+CAAAAAElFTkSuQmCC"},"Gengar":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFSUlJrUpR7Y7Wce9a1a5S9rbXve3P////9tmZcAAAAAXRSTlMAQObYZgAAAMlJREFUKM+1kTFuAjEQRcc3sJddqDFEokXeC6x5KLSLmBtEiCtsiYQQPQXitilSrIfQpMiUz8/++mOR/5rwDtb+Hez8jx2KU0fneuclqIE0feODdlLCrL0GPZRQKlXdfygmsFHVwxYD3VZVAfPkFFWARdFisgI4QlqPYlrVcLqQky/gEs63L1iMpoQKdldao8osAhGYl/GPGOMd8rqEn89haPPSNqqHIUGOBlYkeLkukwhsbLq4NGfTmpoiEnyo4fcHOrOk0Za/zjfijitf6zbAhgAAAABJRU5ErkJggg=="},"Azumarill":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAKlBMVEUxMTExMTFChM5SUlJSpeZjvfeta4StlK2t3v+1QlK9vbXelMX3a1r///+pkmhwAAAAAXRSTlMAQObYZgAAAMVJREFUKM+1kTEKwkAQRWfwAn+DwcYUCaRMYWGnpQdY9YNitvUU3sZujyGIfSRl7mKn2V0sLJzy8efz/4zI38aIiCJkSojkZaTMrEhuI6h36DGBD2ibwBZ6iT1lDr0jgeXslsCMq9hSlGRiWXBPxo0sXU0bb5/thjborzlPJIlx1enakSShhy0+kHQ9d1BWb6iZ611fEZKNck2art4+aYNDa9d0jV9akXHWYhi8N9BAWQ7eXwFjgscZ7xdiEDU1hvjy5l/nBSHFKseljvcnAAAAAElFTkSuQmCC"},"Breloom":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAALVBMVEUxMTExMTFCc0pSUlJSnFpzxWOU1oSchEK1OkK9pVrWxXvmUlLm3pz/lKX///9/cb4sAAAAAXRSTlMAQObYZgAAAOhJREFUKM9jYKAKEBQUwBRzDXVEF2V0Sw0NdUQTFE0DCoYIoAuGAgXRlIqAxJTQBBldQ0M9dqgIMDAiiwqbhOhKmwgwSiGbK7VY0GKHiYCIlSCS9nmnHk42EmQQMnZFKGV8c0Z41UQgnaqCJHhSfNUqIJcxVBDZm4xSK0F8YVQPyJyaDhSQQRFkrDm5aiED4xkUQZkzx2cdZJA5iKJQ5vAZY2PBMxORBaWbjc8YOc9aiaJb2sTJepOT5UTUEFFysTYNMUR1EKOLoLIqeihLNwsIijgLoEcm0DfNjZixzLhxIxZBAUGSkwsA8ZoyRPXCw7AAAAAASUVORK5CYII="},"Tapu Koko":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUhISEhISFKrZxSUlKEaymllDGtY0KtjGu9rUrmhEL/7zH///8OWV+3AAAAAXRSTlMAQObYZgAAAQZJREFUGBmtwbFKw1AUBuD/vMG5pITmZgo+QbxEEn2ASpwk9AFKodC5LuIkdQjZQkA448VC27uVTL6dYGhsIjj5ffg3pBhjpJ1SGNFutRbGAB2PUisMBSI1Y4REGGO0lhqXCKQQCOOSZv3BgdRQAKNDpd2bRzFMjsmiQ+n2Jfls7k7aWV0xvlF5uymi5hQ5d3AHRmeatsVVE0WVc65idEhv5llzHeb7vLI4m7bzIjOT6m1vGWeTTWLaNsyfZxY9z5nEmEk121n0aGuK9TLMH55e0SOTZCKx290zel6s/HdZNGXJ6HkKlJmgTRV+KMCTmzBWGKBl43uMIVopWjCGSAE+4zdi/OELwshEp24DiPsAAAAASUVORK5CYII="},"Lucario":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJahM5zc3tzrffFtVrFxb33Y1L35oT////zdlQwAAAAAXRSTlMAQObYZgAAAIxJREFUGBnNwbEVwjAMBcCvDaQ4POo4TkEZmCB+oqGzwSuwCQ1dRmBT2kip6LjDH2Ps0QyGRxcp8GicCjwaY4FHtTZhWAdtj7TA6q9V4wCDkh41ZcZWr/mtooytLuurssCg0O5xgUNdTI0FFj1TKB9YdFrpxrBCjKIMK5ynKnBoaDM8YlHGXs/YE/zsC5hIEdUCe8lhAAAAAElFTkSuQmCC"},"Metagross":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFKa61SUlJjjN6EhHOEtf+tQkK9vb3vWjr///8Bwnr7AAAAAXRSTlMAQObYZgAAAO9JREFUKJHNkU1ugzAQhT03GAcUscUm7I0ty10Gj7KPsskWkHyA3iBClawue4ScNETgpoIcoG/5ad68+WHs/4q/YSBxW5bgywAdA604Rwb1r2Ffsp22IXQIokswVyxrwqQS2mNyU4MZ1SH0lItq8UPbqJFaIQ35F6y8jBNwF69Fu8C8In012sXRDmZpCoI8ufEaR2MHSQLnHCHpEOP5k6xPTcHQcTd5P358OBmiGd60gi/3XZEMQZOag7BAlsl4J1v3nt/S9M80d5FPiH+vxaXam7ovV+dD6MWpYyvBtH65hiwLA25god0WQvH2fXPhA9WLMFSwVjA+AAAAAElFTkSuQmCC"},"Salamence":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTE6c5xSUlJSlM57vf+EhISUOkK9SlK9vb33a2v///+xHdq/AAAAAXRSTlMAQObYZgAAAQFJREFUKFO9kT9Lw2AQh+++QY6k1iaTQQVxiuElwc0a6WzPH+hncJIg71xUODKL2LG4dbeLX87F/NEKbv7Gh+fuuDui/43IFiH2XoQlGMAoIPG1xuvVgEZnRGOntTUDypVweFH40ppVD03jNxS+NGs6dYzTtVPvazNbtHCk9gr1EpqZfamMm+R9nmbEAziaAwAQxLaQtp73pzk0z3jXApK2qSyXTqsitAch6vYVya+cOnP4doPIFUAO4KQ/AFfn5T0AQNO9TpwepgAOrqHpXS++bFJAZ09VFnRwtrP5cFB5rLqWk2fh5NbhkiZH/RwhYgmBgH++hYFO65Mc/wK3av/OJ/ADQcj7MAtVAAAAAElFTkSuQmCC"},"Kommo-o":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUhISEhISFCQkJjY2N7c2ullDGtpZy9WlLWvUrWzs7///+doy9OAAAAAXRSTlMAQObYZgAAARJJREFUKM+tkjFrhDAYhvP9g++zRmw3g0Hb7Sh0V0LpqlRwbShys4tdTe8w6y2FW6VTf2U96GmudWzGl+ch4X3D2L8cwJUw7FfAqv/BaVG4rWkKCwb1ooS2TieEY7jLZrsb3sSEQLRTuIRdu5fISCtRzHbSJdIUYGNROWGbGlOEz7kpzzoI7Y3tHrkSqTyTcPxotJU9UCXMfNH1o1bJ6XrKaH6m9+Kr5MRA5tbh2afywFjghIxyZW6PSI1TFnzm9l2PUfPqNnhzSO/1V9xc2CVePdyNW9+1TcSCCbSRW3uMEDfS5Ft0QIV+rlJD1g0z5imSPePOUqQQBIYlXsxHjE9ltptfQwMGQ7v5u/JAKx9iKe0b4eU77t3iRPkAAAAASUVORK5CYII="},"Chansey":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTFSUlK1Y2POe4Tme2vmlJT/xb3///9yyJg2AAAAAXRSTlMAQObYZgAAAKFJREFUGBnVwUEOwVAUBdD7dvAfqZqqpMZVybcAG1D5C2gkzxjJv+YGLFtnXhkZOgd/RxWfREnFmEw4CPBkduLgDK843DiIAY6sznww1nt4ZWYZ6y4FvElmYt2lBRxhJC+p6uFIXLNllXs4ct0uSVoPb/6MjNkCvOJ5b81M4RWpM7PjLsCRVJvZRuFJZWYLxci0Va0ajIlC2gZfJAV8U/zuBakTJclvXCfPAAAAAElFTkSuQmCC"},"Quagsire":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTE6UlpSUlJSc6Vra85rreaUzv+t3v/IYIqmAAAAAXRSTlMAQObYZgAAAJlJREFUKM/VkTEOAiEQReEGTjRD7wlMMPQbE6zXG2xg/9bGDXMFjy1asYOJta98+fB/wJj/gmjXO5FJWyvPapV0rspVRV2RipIHWe6dZF9Py6iLvL8WJQ2LFOh6i8qs6+NHErXBEpHzPB65CdsHEFfcGO0Ne6QlYgBO7fqQJCBsB3DKHgjDpt8SA5fuTS2dod17/2R6vnzIT17t/ic4SZO5+gAAAABJRU5ErkJggg=="},"Forretress":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTFSUlKEe4yMQjqlpa21nM7WUkLe3t7mxe/vjIT///+V2k/6AAAAAXRSTlMAQObYZgAAALJJREFUKM/dkbEKwkAQRHN/kE0RtMwSPK8UqysVIdimTRUCB5Y5hPzHBU7mF9LpF1q6F2xs3fKxM+zMZtm/jqKMaA23IGBF1WABxDyFMxB47hNYWMBGe5CMrjc4HB2EXl3OABBvofpQVe8NGAD0KOSjCWyAOJ2E6Ya5a8GmkqYP9s8X13d5qALrruVmGdOUwfPUTItcLRy01177PM0eTNj1aSXlADiXr2oqHTn61vLvv3kDMj0xW/3OMHkAAAAASUVORK5CYII="},"Gyarados":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAKlBMVEUxMTExMTFCe3NKa8VKlOZSUlJzxf+Me0q9vb3FrWvWY0Lv3pT3jIz///+OiwfuAAAAAXRSTlMAQObYZgAAASRJREFUKM+d0TtOw0AQANCZG8w6MTiIFFjyASycgiKF5VlAIIo4uwFkuYgwdJQIpUyXhoIisnIADpCKgpoDoCiSG9+FBryOccWWTzM7P4B/PNFiWPxVtIuvJhEW5byBFkG/JKQGYr8kh6DulrAfebog0RXmQ3dyP3mQc3CC4U8oHqGrY53xDTn88ptv2V7sZYpDcLioMPbcSTTgEeB51Sy6rsesNQEOq+oYe2MeBDKErm86skcblldbKY5fzZCnF5soLZWM2ET27jJmuVCJOjED7X/kLHW6vUwCU8fXM6VXS83KZHdEeqvG18+r5Zmp0yH7bdkdrPJZTjU8+FxjKGZ57SDoH27XOAWxcyTxlBDs7a4doPfegigAp21nD9swoBYVBr8BdS8/3GzD59YAAAAASUVORK5CYII="},"Aerodactyl":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJ1BMVEUxMTExMTFSUlJSpXNzWpyEa2uMc7WcjIycjP+lUjq9vb3WY0L////rPKxIAAAAAXRSTlMAQObYZgAAAMRJREFUKJHF0DEKAkEMBdDkBomFC9OtgoN7DllrCw8gyGI7AxKws5vaVpuRhYXcQDzA4q0sZ1wtLARTPv4PJAB/GfyEBX2JKO4D2vIV6K3OhA6QAbM6i0NHowiY6iiLJatTAlOlPjdbo9oRsZSZblTVlxE7jZl2ar1G0zQa09pr7KWq2hBCShqd9mLbOgROQe3EW6mb3TG772D9xMuMx/lJhZ2f/H4FmCP688Wthz/i+42KIeKjJ7Y0wMIB+gECEwDDT+YJtk4yDrRnhLoAAAAASUVORK5CYII="},"Haxorus":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTFSUlJra2tzYxCljBm1QkLFrSn3Y1IotCuiAAAAAXRSTlMAQObYZgAAAM5JREFUKM+1kj0OwjAMhe0b2EXQrsFE7UqiSF0R6gEaVDHDESJVmWkXjs0GTejCgMfPzz9PNsC/AmkFVisQZwKALIEPYMBHVm145G94jd0mhfis49hJBmcTg7c51NFLS9nwMjbSKkwhhsq2eptoCe0sk9eUGC5FyXQNJ4DNG+LYU6V9VMD2A283KKyrDzweF00JxZo6RNcvZ23FNjEMfrkAXsxgpmk4LYV8doMTfUiE933f9RenEk+7HTEVJrXPSAC4Vyvnq5rvAzIy/fgbL0fhJPd7giVGAAAAAElFTkSuQmCC"},"Volcanion":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJ1BMVEUxMTExMTExe+8xtf9SUlJaY2uUMSmtQkK9UmO9cynWlDr/zjr///9sR37UAAAAAXRSTlMAQObYZgAAAQ5JREFUKM+VkrFOwzAQhu03sFFEI8oEA1lRkJKBheioI1jDA1QKsQVT2oAjZWobjpN4BKYOPEAXBvpybMEmLNz46b9P9t0x9u+SYsw4zuUYGvyUv/HkBA2ufIVMTx+pN8I3JoTrCHyoN+3DOt34MIvOg5yS2nMepCIs49aXTkiiVeRBvmxztFm08pxNnOsmS2vv+SGQhqW9qJx+bkqCxVkMc7edGugXiZ25wcCQeVEWrpzg4S1RewdwXfwkeXVDbx+FsqBqB+b49QS6mLVqiB5VoT7umvu8f8YBBltpL7tdSaHSA+SCBd1ehIj91v3R9F2y4FV7++B7yRgn8ocsGWNTY8a7l7vdH/cgxufg1Ddjc0aeiFfVTwAAAABJRU5ErkJggg=="},"Charizard":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAKlBMVEUxMTExMTExa1pKhHNSUlK1Qjq9vb3WY0LWtWP3lCn31nP/Wjr/5in///+rFhdFAAAAAXRSTlMAQObYZgAAAQJJREFUKFONzrFqw0AMBmDpDXSF1hyhS5bMzRuE2FxvyGCI+x4HR8XtnbodXDCCjp68dSzpGzR7XqdDbMfFpu0/fuiXBPB3kGZw8V/E4/sMfhxpip+z+HXtE4AiJAB9GhAjYFXqSLA4xRHqotpLJHyjHrXDoKrKSiR9RcIIt5U1Eo3r27LREXCfliwjrGVDaNNyxYm7vhYRdlrMdr1iM2A4MwcRv11z388O8ZxzsGL8Q+Zdt5JvuMjaxiYm7FCL1L7Etm3EuCzv8CCuKPG1zZPx3F3H4OjuKXtsbKrZ9C8pAlQZ78TKcPwSZL+zworGCEq9hPrH3IWZpwj3zzRFVFP7Pd8wgVQ5z4gsBwAAAABJRU5ErkJggg=="},"Venusaur":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAMFBMVEUxMTEpe2sxMTFClIRKc0pSUlJjlFprvaVztVqUc0qlQkq9vb3ma3P/taX/xQD////3zKq7AAAAAXRSTlMAQObYZgAAARpJREFUKM+1kb9Kw1AUxsN9BEW6hqPQwUKph+CgIIQbyOz1hBbrVkLWEsLZy1X6Ar6A0KV08w2ELuUGQXCRZHR1dfUOJk2qi4Pf+OP7c7jXcf5T4AL8YPlLXuxQURoam9JtwZ5ZfLwvVztwaZ2rt4fWiMgLszHmqcGk3zOm3JRmXeeFlJLyvFzcFFd+7TwiGdD4dUTkb48SUxrGweg+umysCx5qPQkojmewLc3myZxkNAnv9KyC3UzrW48iSsIkdKs0kyZOPaQw1N+we8oZMZ+v0dIqbiGnyEYhYrUvFDN3IEXleXhSbR9YuPdsbS3YYe5/ojfA67P6zGM1tZ2ocND4EAGHNgu4j603FgAgHuvChvoXv0ABrvNXfQEXOVsO+cu6vQAAAABJRU5ErkJggg=="},"Blastoise":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAKlBMVEUxMTExMTE6Y4xSUlJSe61rSil7e3t7re+MYzq1hEq9vbXOtVL35pT///9JWp96AAAAAXRSTlMAQObYZgAAAPFJREFUKM9jYKAZYBTAIii2EIug1CoBTPViqxYyMArKXkQ1M6tVUDL4oiyKUnGJyKlTrVAFGcudLY1Ns9aiaGcsLy8uN01bZYmsUry8vLzIKiw1EkmQUaS8XLzIamnERCSFIo4lhVfKjVdFRCCpFDEvkriyxdh4aQdCkNEZaKT3ZmMXq6WBCMEl5u7Vu403lzgvbURoF2S03m2826TceVWjIJJVwsa7N5e7m1iZOCK5SXH37sPXS0ysFiM7VMnmzGary0XOKMEqpLx7t7F5uQpKKDEKApWWowkChaV3mxc5YsSdoKwLlphivIstTgVJThoApGxCO3akUB4AAAAASUVORK5CYII="},"Snorlax":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFCa4xSUlJShJycc0K1jFrOvZT/78X///8bvsivAAAAAXRSTlMAQObYZgAAANBJREFUKFO10T0KwkAQBeAMXiDrf+sopHZXIa26jQcI1iKIrW6xqTXg68X7OjY6MYKVr/zgzc4ySfLnmC9Go7RpbU7JfHgf1aIz0UiGLgC819j1Zg93qJYKyd+APXbVSLfXTsoHnGu4ynFxDqyxlQMz7y1PFQ6Bq+BqnDZxyS+klEp5Jsw8v3G4NVEQJ1bYh81EI2sclCGL0dkaUgwcw/0m9l6T4omzvCytxmRwZJbtrWo/dzKcF9dQ+6TEzItNaJyjV2ymn5ZQERomA74d+Fce7Rw3SxClIOgAAAAASUVORK5CYII="},"Axew":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTFSUlJSczFarUpjnDF7/xCEzmu9vb3W963mWkr///8ipSXdAAAAAXRSTlMAQObYZgAAAIhJREFUKM9jYBh6QACLGKMhFkFRLIKMwZiCjKJGmIKixsqGmJqN3R3RBYWNzctL0N0kbFJs7I4mKFgcvrrZHFWQcVJ5qdRmE3SVIEG3REZUpSXlnk5pKuKoagWFZs5UKipHM4BRSKncCcNRIk7qKoroXnJyUXLBCFFBQRdHLAEqXogt6AVIjkEAEW0WSdRXdugAAAAASUVORK5CYII="},"Deino":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJaSkpahM5rWlqEc3OErfecc86cjIy9QqWdjNszAAAAAXRSTlMAQObYZgAAAIpJREFUKM9jYBhygFEAi6AYFkHGNExBQbFETDHTNENMvWlpqejaGWcCRQPRbc6cOS0N3VCxsOTMmeiCwmHmwWHogoyl5eZhAmh+YiwvLw0SFBdEVSrR7mwWXFKIpl/YNG2pObpLpcKWGZc7otsfHOxSjq69XMTYUbwQPUQY3QUwg5mxHFvIC5IRhQCHzRogK88UGAAAAABJRU5ErkJggg=="},"Bagon":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFKY6VSUlJjjM6EtfeMjIy9vbXmvVr31oz////hNDvTAAAAAXRSTlMAQObYZgAAAIdJREFUKM9jYBhqQFAAQ4hRsNwQQ1DMvLwQXSljcnlZeiGmoHl5GbpS4eLyYjN0QVHjYqtEdO2hwVZSngLogqHhSzzQBV1DXUyc0fWLuDgvdk5GVyrRYWSCYT2jsHIopkdFTIOCMFQ6B5uEYgpOUQ11xNBuoRLiiBmiIi6Y4Qz0lgC2GCE5DgHToxgki/zfZgAAAABJRU5ErkJggg=="},"Beldum":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAGFBMVEUxMTExMTFKa61SUlJjjN6Etf/OQjrWY0L+8D+WAAAAAXRSTlMAQObYZgAAAINJREFUKJHdz7ENAjEMBdB4AxJyA2BngtgL3NkLgJQJKKgR+0tEVDhuqfjl05e/nNK/BvIpYh3XiNs4YrVg24MCN9tX2wYHrONmYnk5ObGrOAVjMRWV7y3Qx91IjBzS84VKTd3WeTaZDrq4Ie6dUcQhFMyVeXkVcirNMH4626t92j/JG+ibE3P82XFYAAAAAElFTkSuQmCC"},"Riolu":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTFCY5xKe71SUlJzc3tzpfe9vbXFtVrmznP3Y1L////sRGZSAAAAAXRSTlMAQObYZgAAAIZJREFUKM/dz7ENAjEMBdDvDc4kF+YIiegjzFEj5QY4XeRJWIIJKFiSOjENLS6f/C1/4G9n+mIUQRYTB7PsdFeDQVW3Mb1oE4NVjr4MOK+3t9zB3Vlf86utnGIXd7rLtab+AWJ5GAQ9pV1GdJLPOfaGw0mXbexEJTQee/pCsylPEywCYPw8H9JiFHkQPwf/AAAAAElFTkSuQmCC"},"Sandile":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTFSUlJra2uUa0rFc4zFlFrmvXv///8112ChAAAAAXRSTlMAQObYZgAAAI1JREFUGBntwUEKwjAQBdA/N8g30KxTkKzboLmA4F7wABGp67bg7HtyXSViwBP4Hv5+Iloy4AOJN7oBlXQTCUadUcl2V6XGZFDJ8PC6pHU0qLqd39wtajAoxKZ5dOeYwozCPqPypOPhklG4RVXDGvaWKERz30+9ejGoaHj11IwvNOgyGnI0aIg1aBG/vAAjERdnFDYtKAAAAABJRU5ErkJggg=="},"Ralts":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTFSUlJztXN7e3uE1mucnJy9vc7FQmPmUnP3e6X///8F7AecAAAAAXRSTlMAQObYZgAAAH1JREFUKM9jYBi2QBCMUAHjKkHBmQLogiunmGpgCHZOCQ1GFxTVbA01NUQX1DANDg1E0x0aBBQMFUATDA41RRdkEA4BCqLbxOgSamqsiO56aReXjRjeZKzeLYDpeRFHLCEinY2pknH7tkIMUcYtu3cXYgbo7kIsNgkKkB41ADJeGCUS5AGVAAAAAElFTkSuQmCC"},"Larvitar":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUxMTExMTFSUlJrjGOExWutQjqt72vFztbW/5zeUkr///9uJcfRAAAAAXRSTlMAQObYZgAAAIZJREFUKM9jYBhqQBCLGGObABbBFCyCItgExVwwBRnVsAiKuaU5YijsSEvDMFSsIyVJDUMwzU1KzRFNVCQtKUotKRHNTOM0p7QkY1SlIipmaSlpKqiCQk4qaclpSaiCjE4zk9PU0MxkEI40S3NCCz3GElGzFAwvCTIKuxhiCdByASLjgxAAABJKFlTaWErRAAAAAElFTkSuQmCC"},"Goomy":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFCtVJSUlKE3oyMY8Wla72ljN69hN7WxffcbdaEAAAAAXRSTlMAQObYZgAAAFtJREFUKJFjYBgFpAABLGKME7ELYqplLMSiVtIQi6D4TMlADN0zZ07HMFPEcuZMDJUiMy0nYZgpNHOmiiK6oNjMNBU1dEMZ0zqaOhrRBTsEOxIxrBdkEMQQIwwAGpwRKTWZRHQAAAAASUVORK5CYII="},"Jangmo-o":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUhISEhISFCQkJjY2OUlIy1lDHFxcXWQjr35q3/3lL///9cOTgmAAAAAXRSTlMAQObYZgAAALtJREFUKM9jYKArYBRgFMQQlJwoOVMAXeFMIJhIlOCMzg6wILLJjDM6OmYqAg0VbUUyWQIoqJYIopEEJTs6J6Whq2TUmKSkAlTJ6IhsU5KS1GKgoAiyY8XSrKqWJDIwuqAImqWsShNgFHFEcWhaWlqKoFgyiiCDoFuai1tSBpr/BY1d1NQU0X26yihJLQk9pKSM0pSa0AQZlYw1BJXQ9DMqChsyCKEJiioyGjKGCmDEkiEDtnjCGqNkJAMAZzwna3IrGokAAAAASUVORK5CYII="},"Ferroseed":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFKhFJSUlJjrWtzc3Otra3Oztb/vSn////rV5B8AAAAAXRSTlMAQObYZgAAAHpJREFUKM9jYBgFDAyMAlgEBR0xRQUr1QsxREXCy0PQBRnTp4aGFqILVoaol6MJMopVlpaVp6LqZ3Q2TS9PDUczVEIiNDi8zBFVULTFQ8I9VRBVUCy0pKU0DE07Y1hoaFgiupMU09JSAzGCQ9hQCNPzjIrYwglb0BECAOdKFVsnCMjCAAAAAElFTkSuQmCC"},"Mareanie":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAIVBMVEUhISEhISFSUlJzra2MY621jNa15u/OvTHevff/7zH///9TgncBAAAAAXRSTlMAQObYZgAAAK5JREFUKJHNz7EKwjAQBuDkDUylAccmNLraorgWzAM0cO694k9n38AO7k7i6pO6Junm5D9+/MfdCfHHUWq1tO7ZLbTcvuocpQm3kGNJ3vs+KzIREaVVuQNdiIcEtT1e0UxVig6MybpkvniAYZBhiwKMeYhVG2wwuqbdR8txMG9ghk2QidxoYKJxDWs+Doz40ALr+hwAe48fUpIoAFX2Z+1Jn1ITQpW9VCKPzGs/5wtDqyUVBs0wMgAAAABJRU5ErkJggg=="},"Honedge":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJ1BMVEUxMTExMTE6WoxKhMVSUlJatf9rUjGEa1KUlHOtjGu9vb29xaX///+vThoLAAAAAXRSTlMAQObYZgAAAK9JREFUKM9jYKAtEMQixmiMRZTR0FgAQ1BYQNgQi5GMRuhKGbsFgIrRBXcABdH0M0pvZEDXzyjtAlTJiGq/9BZT70YGNP3SLsHeG9EFGdeklewWYDRGFTyVfspDQDQY1U1i5WsEGYOCUAVllicyiIYqorpTco4AUBDNR5KVAoyhaIKM0z0FGIODA9EEK4HaTU1RvTlzCkgQNewZSyYCCbT4YCwpxBJt4tgEGQUYyAAA/Qcda+4Cx0YAAAAASUVORK5CYII="},"Litwick":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTFSUlJ7e3uEnNaUe86cvc6lcyGtpc6ttcXOpSn////qTFonAAAAAXRSTlMAQObYZgAAAGtJREFUKM9jYBjGQACLGGMgsYKirQJECoqkYAoKJgUloosy7mhL69iIJii9u6Oje7cAuiAIYArOxhCU3L1z5+6daIKMu2dXz5yIbrvx7tXWhujulJ69ezOGO0GWb8Tw0ezdE7H4U1CA9IgBAGNCIj0xPAr9AAAAAElFTkSuQmCC"},"Magnemite":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAJFBMVEUxMTExMTE6a5xSUlJSe9ZzpZyEhHOlxf+tUlLOzsX3YzH///8PIW2BAAAAAXRSTlMAQObYZgAAAItJREFUKJFjYBgFDAyMglgEpWcKoIkICjIKG6MJMnakiRcbF6IJGhuXAwGqUmFj493bq8sLBQUR4oxKada7d5eXW86c4ois21p6d3nwzLQkRWTLpXfvDg2eiawdZOruraHBmbMWolg/zTQ0NFQsoxFFME0w1DiQEVU3gyCD4DR0b4IVYxFkwBZKZAEATbweVbS/BSwAAAAASUVORK5CYII="},"Dratini":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAG1BMVEUxMTExMTFSUlJac5xjjL2EhHOMtf+9vb3///91f84JAAAAAXRSTlMAQObYZgAAAIZJREFUKM9jYBiuQBCLGGMhTkE05eJFggIMjI1oghpuiQwSaGYwuqSlCXYIoAmmZZgllaMJSrgkiml0oJrJ2NHhLKYeKoAu2JKWVKiIpr3DxUVAKA3VoYwiQEGxNBc0A8pdHNNSXBxRBStanJVdBNGUgkwtxPB9Rzm640GGlmMJU0FBMuIGACYpGjJMO7LPAAAAAElFTkSuQmCC"},"Skrelp":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAAHlBMVEUxMTExMTFSUlJ7tdaESjqMY6WU3v+tY0K1hM73QjF9IXKOAAAAAXRSTlMAQObYZgAAAJxJREFUGBnNwTELgmAUBdD7/sG7Yn42KoStYrRXgnMt0Vrg/knw9kBwbuvftvZyausc/DkqvojKtsaXELO+xieq2HC4KT5IuwtmBeGke+uM8GRvXWmEF+5mFuEFW1aFwpFwea0jvHw6PSeFl4z5NCrhCIWrY8TM4qzwqNx0BbyUTf5oCEfaso1Nr3CSqtLsqnDCEKIQnlBMMUfFr96fThm3IW7J3wAAAABJRU5ErkJggg=="},"Rockruff":{"icon":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeBAMAAACs80HuAAAALVBMVEUhISEhISFSUlJShLVaSkJareZra0qEWjqljGulpYTWtZTW1sXelKX/vb3///8bE92AAAAAAXRSTlMAQObYZgAAAL9JREFUKM/N0T0KwkAQBeCdG8yG+BNSuYWYzSkEC/EIKS08gZDaVEEr7YJV1m4KIdvJXMAbeB0Lm8wqaOkrP5gZhqfU30R/wlQqaKUURB77OCTUmDL3ETa2pQkzd32M7tO1Y/ad2FkbSzmfjgKJyOW3TOCArkTaNOJ6vGoLh4lAKLeXYj9J5MpHeagr68S0GpXLKrckEWJj2Aeokubs7RtmxreznUSoaovjEGtLGM8DXESEgGEVEJ55fYW/1vYlT/8ZMvS4kXbWAAAAAElFTkSuQmCC"}};

/* ---------- host helpers, guarded ---------- */
const E=typeof esc==="function"?esc:(s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"));
const I=typeof ic==="function"?ic:((id,c)=>`<svg class="i${c?" "+c:""}" aria-hidden="true"><use href="#i-${id}"/></svg>`);
const RA=(typeof ROLE_ABBR==="object"&&ROLE_ABBR)||{"Rocks setter":"ROK","Spikes setter":"SPK","Hazard remover":"DEF","Rain setter":"RAIN","Sun setter":"SUN","Sand setter":"SAND","Snow setter":"SNOW","Rain abuser":"RAIN+","Sun abuser":"SUN+","Sand abuser":"SAND+","Snow abuser":"SNOW+","Pivot":"PIV","Setup sweeper":"SWP","Wallbreaker":"WBK","Wall":"WAL","Phazer":"PHZ","Revenge killer":"SCF"};
const ROLE_OF={};Object.keys(RA).forEach(k=>ROLE_OF[RA[k]]=k);
const CAPX=typeof CAP==="number"?CAP:100;
let usedCap=typeof USED==="number"?USED:93.2;
const M=v=>(v<0?"−$":"$")+Math.abs(v).toFixed(1)+"M";
const sprite=n=>(typeof SPR==="object"&&SPR&&SPR[n])||(XSPR&&XSPR[n])||null;
function icon(n){const s=sprite(n);if(!s)return `<span class="ico" aria-hidden="true"></span>`;
  return s.icon?`<span class="ico" aria-hidden="true"><img src="${s.icon}" alt="" width="40" height="30"></span>`:`<span class="ico" aria-hidden="true"><img class="fb" src="${s.front}" alt="" width="40" height="40"></span>`}
function front(n){const s=sprite(n);return `<span class="spr" aria-hidden="true">${s&&s.front?`<img src="${s.front}" alt="" width="96" height="96">`:s&&s.icon?`<img src="${s.icon}" alt="" width="40" height="30">`:""}</span>`}
const rname=ab=>ROLE_OF[ab]||ab;
const prow2=(k,v)=>typeof prow==="function"?prow(k,v):`<span class="row"><span>${k}</span><span>${v}</span></span>`;
/* Pokémon reference: icon + name with a peek (host pkRef/monRef when present) */
function pk(n,o){
  o=o||{};
  const hm=typeof BY==="object"&&BY?Object.values(BY).find(x=>x.n===n):null;
  if(hm&&typeof monRef==="function"&&!o.club){try{return monRef(hm,{icon:o.icon!==false})}catch(e){}}
  const rows=o.rows||[];
  if(typeof pkRef==="function"&&(o.icon===false||(typeof SPR==="object"&&SPR&&SPR[n])))return pkRef(n,{icon:o.icon!==false,title:o.title||n,rows,note:o.note,href:hm?"#mon-"+hm.id:undefined});
  const pop=`<span class="pop"><strong>${E(o.title||n)}</strong>${rows.map(r=>prow2(r[0],r[1])).join("")}${o.note?`<span>${o.note}</span>`:""}</span>`;
  const inner=`${o.icon!==false?icon(n):""}<span class="nm">${E(n)}</span>${pop}`;
  return hm?`<a class="ref peek" href="#mon-${hm.id}">${inner}</a>`:`<span class="ref peek" tabindex="0">${inner}</span>`;
}
const pkA=(a,club,extra)=>pk(a.n,{club,title:club?`${a.n} · ${club}`:a.n,rows:[["Role",`${rname(a.ab)} · ${a.o}`],["Age",a.age],["Contract",`${M(a.sal)} · ${a.yrs} ${a.yrs===1?"yr":"yrs"}`]].concat(extra||[])});
function rbA(a){if(a.R&&typeof badge==="function"){try{return badge(a.R)}catch(e){}}return rb(a.ab,a.o)}
function rb(ab,o){if(typeof oppBadge==="function")return oppBadge(E(rname(ab)),o).replace(", scouted","");return `<span class="rb${o>=90?" elite":""}" role="img" aria-label="${E(rname(ab))} ${o}"><span class="rb-r" aria-hidden="true">${E(rname(ab))}</span><span class="rb-n" aria-hidden="true">${o}</span></span>`}
function rbRange(ab,lo,hi){return `<span class="rb x-rr" role="img" aria-label="${E(rname(ab))} ${lo} to ${hi}"><span class="rb-r" aria-hidden="true">${E(rname(ab))}</span><span class="rb-n" aria-hidden="true">${lo===hi?lo:lo+"–"+hi}</span></span>`}
const grade=g=>typeof gchip==="function"?gchip(g):`<span class="grade g${g}">${g}</span>`;
const chip=(cat,icn,word)=>`<span class="chip c-${cat}">${I(icn)}${word}</span>`;
const hd=(h,adv,act)=>typeof head==="function"?head(h,adv,act):`<header class="l-head"><div><h1 tabindex="-1">${h}</h1>${adv?`<p class="sub">${adv}</p>`:""}</div>${act?`<div class="l-actions">${act}</div>`:""}</header>`;
const inf=(label,pop)=>typeof info==="function"?info(label,pop):`<button type="button" class="info peek" aria-label="${E(label)}">i<span class="pop">${pop}</span></button>`;
const peek=(label,pop,aria)=>`<span class="peek" tabindex="0"${aria?` aria-label="${E(aria)}"`:""}><span class="l-peek-lbl">${label}</span><span class="pop">${pop}</span></span>`;
/* fixed-layout table: px columns are fixed, "auto"/% columns share the rest; min width = px sum + 200 per flexible column, scrolls inside its own box */
const table=(cols,rows,minW,cap)=>{const px=cols.reduce((t,c)=>t+(/px$/.test(c[1])?parseInt(c[1]):200),0)+16;return `<div class="l-panel flush"><div class="l-table-wrap"><table class="l-table" style="min-width:${Math.max(px,minW||0)}px"${cap?` aria-label="${cap}"`:""}><colgroup>${cols.map(c=>/px$/.test(c[1])?`<col style="width:${c[1]}">`:"<col>").join("")}</colgroup><thead><tr>${cols.map(c=>`<th scope="col"${c[2]?` class="${c[2]}"`:""}>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></div>`};
const btn=(label,attrs,go)=>`<button type="button" class="btn${go&&!/aria-disabled/.test(attrs||"")?" go":""}" ${attrs||""}>${label}</button>`;

function refresh(root,html){const t=document.createElement("div");t.innerHTML=html;root.innerHTML=t.firstElementChild.innerHTML}
/* ---------- dialog: centred, Esc closes, focus returns ---------- */
let XD=null,XN=0;
/* Uses the host's shared dialog (openDialog / closeDialog, dialog.l-dialog) when present; own <dialog> otherwise.
   o: {title, body, actions:[{k,label,go,dis}], on(k,dialogEl,btn) -> false keeps it open, change(e,dialogEl), done(), focus() -> element to focus after close} */
function dialog(o){
  const id="xdlg-"+(++XN);
  const html=`<div class="l-dialog-head"><h2 id="${id}">${o.title}</h2><button type="button" class="x" data-xd="close" aria-label="Close">${I("x")}</button></div><div class="l-dialog-body" data-body>${o.body}</div><div class="l-dialog-foot"><div class="l-actions" data-acts>${(o.actions||[{k:"close",label:"Done",go:true}]).map(a=>btn(a.label,`data-xd="${a.k}"${a.dis?' aria-disabled="true"':""}`,a.go)).join("")}</div></div>`;
  const after=()=>{if(XD===o)XD=null;if(o.done)o.done();if(o.focus)setTimeout(()=>{const r=o.focus();if(r&&document.contains(r))r.focus()},0)};
  XD=o;let d;
  if(typeof openDialog==="function"){openDialog(html,{labelledby:id,onClose:after});d=document.getElementById(id).closest("dialog")}
  else{const ret=document.activeElement;d=document.createElement("dialog");d.className="l-dialog";d.setAttribute("aria-labelledby",id);d.innerHTML=html;document.body.appendChild(d);
    d.addEventListener("click",e=>{if(e.target===d)d.close()});
    d.addEventListener("close",()=>{d.remove();if(ret&&document.contains(ret))ret.focus();after()});d.showModal()}
  const f=d.querySelector("[data-acts] .btn.go:not([aria-disabled])")||d.querySelector("[data-acts] .btn");if(f)f.focus();
  return d;
}
const xclose=d=>{if(typeof closeDialog==="function"&&d&&d.id==="dlg")closeDialog();else if(d)d.close()};
document.addEventListener("click",e=>{const b=e.target.closest("dialog [data-xd]");if(!b||!XD||b.getAttribute("aria-disabled")==="true")return;
  const d=b.closest("dialog"),k=b.dataset.xd,o=XD;if(k==="close"){xclose(d);return}if(o.on&&o.on(k,d,b)===false)return;xclose(d)});
document.addEventListener("change",e=>{const d=e.target.closest&&e.target.closest("dialog");if(d&&XD&&XD.change)XD.change(e,d)});

/* ---------- league data ---------- */
const TEAMS=[
 ["VER","Vermilion Volts","Kanto East","Bulky Offense",4,1,9,4,"W2"],["SAF","Saffron Sages","Kanto East","Stall",3,2,7,5,"W1"],["CEL","Celadon Florals","Kanto East","Sun",2,3,6,7,"L2"],["LAV","Lavender Haunts","Kanto East","Hyper Offense",1,4,4,8,"L3"],
 ["PEW","Pewter Peaks","Kanto West","Hazard Stack",5,0,10,2,"W5"],["CER","Cerulean Tides","Kanto West","Rain",2,3,6,7,"W1"],["VIR","Viridian Verdants","Kanto West","Balance",2,3,5,7,"L1"],["CIN","Cinnabar Embers","Kanto West","Volt-Turn",1,4,3,9,"L2"],
 ["BLK","Blackthorn Wyrms","Johto North","Hyper Offense",4,1,9,5,"W3"],["MAH","Mahogany Frost","Johto North","Snow",3,2,7,6,"L1"],["ECR","Ecruteak Spirits","Johto North","Stall",2,3,5,6,"W1"],["OLI","Olivine Ironclads","Johto North","Sand",1,4,4,9,"L4"],
 ["GLD","Goldenrod Gears","Johto South","Volt-Turn",4,1,8,4,"W1"],["VIO","Violet Gusts","Johto South","Bulky Offense",3,2,7,5,"W2"],["AZA","Azalea Hives","Johto South","Hazard Stack",2,3,5,7,"L1"],["CIA","Cianwood Breakers","Johto South","Balance",1,4,3,8,"L1"]
].map(a=>({id:a[0],name:a[1],div:a[2],strat:a[3],w:a[4],l:a[5],gw:a[6],gl:a[7],strk:a[8]}));
const T={};TEAMS.forEach(t=>T[t.id]=t);
const DIVS=["Kanto East","Kanto West","Johto North","Johto South"];
const ME="VER";
const tcell=(t,full)=>full===false?`<span class="x-team"><span class="x-abbr${t.id===ME?" x-me":""}" title="${E(t.name)}" aria-hidden="true">${t.id}</span><span class="sr">${E(t.name)}${t.id===ME?" (your club)":""}</span></span>`:`<span class="x-team"><span class="x-abbr${t.id===ME?" x-me":""}" aria-hidden="true">${t.id}</span><span>${E(t.name)}${t.id===ME?'<span class="sr"> (your club)</span>':""}</span></span>`;

/* our roster: from the prototype when present */
const OWN_FALLBACK=[["Hippowdon","ROK",91,29,7.4,2],["Rotom-Wash","PIV",92,27,8.2,3],["Garchomp","SWP",92,26,11.8,3],["Excadrill","DEF",88,28,9.6,2],["Hydreigon","SWP",86,26,9.0,2],["Dragonite","SWP",92,25,10.2,3],["Tyranitar","WBK",88,30,7.1,2],["Corviknight","DEF",84,31,3.6,1],["Volcarona","SWP",83,27,4.8,1],["Pelipper","RAIN",80,25,2.2,2],["Mandibuzz","WAL",79,33,3.1,1],["Dragapult","WBK",86,23,5.4,3],["Torkoal","SUN",72,32,1.2,1],["Ferrothorn","SPK",81,30,2.2,2]];
function ownRoster(){
  if(typeof MONS!=="undefined"&&Array.isArray(MONS)&&typeof bestRole==="function"){
    try{return MONS.filter(m=>m.g!=="ir").map(m=>{let R=null;try{R=typeof currentRate==="function"?currentRate(m).R:null}catch(e){}R=R||bestRole(m);return R?{n:m.n,ab:RA[R.role]||R.role,o:R.o,age:m.age,sal:m.sal,yrs:m.yrs,inj:!!m.inj,R}:null}).filter(Boolean)}catch(e){}
  }
  return OWN_FALLBACK.map(a=>({n:a[0],ab:a[1],o:a[2],age:a[3],sal:a[4],yrs:a[5]}));
}
let OWN=null;const own=()=>OWN||(OWN=ownRoster());

/* other clubs' tradeable Pokémon (five each) */
const POOL=[["Clefable","WAL",88,27,6.1,2],["Magnezone","WBK",85,28,5.2,2],["Landorus-Therian","ROK",93,26,12.4,3],["Heatran","ROK",89,29,8.8,2],["Tornadus-Therian","PIV",87,26,6.0,2],["Weavile","SCF",86,25,5.7,3],["Scizor","PIV",88,28,7.9,2],["Bisharp","WBK",85,27,5.5,2],["Starmie","DEF",84,24,4.0,3],["Kingdra","RAIN+",86,27,5.8,2],["Ninetales","SUN",83,26,4.6,2],["Amoonguss","WAL",84,30,3.9,1],["Tapu Lele","WBK",90,25,9.9,3],["Kartana","WBK",91,24,10.5,3],["Jirachi","PIV",87,29,6.6,2],["Zapdos","PIV",89,27,8.4,2],["Gengar","WBK",84,28,5.0,1],["Azumarill","SWP",85,26,5.3,2],["Breloom","WBK",82,25,3.8,2],["Tapu Koko","PIV",87,25,7.2,3],["Lucario","SWP",82,26,4.1,2],["Metagross","SWP",88,29,8.1,2],["Salamence","SWP",89,27,8.9,2],["Kommo-o","SWP",86,26,6.4,3],["Chansey","WAL",87,30,4.4,1],["Quagsire","WAL",80,31,2.1,1],["Forretress","SPK",82,30,2.9,1],["Gyarados","SWP",87,27,6.8,2],["Aerodactyl","ROK",80,28,2.6,1],["Haxorus","SWP",84,25,4.9,3],["Volcanion","WBK",86,28,6.2,2],["Charizard","SUN+",84,29,5.0,1],["Venusaur","SUN+",85,28,5.4,2],["Blastoise","DEF",83,30,3.7,1],["Snorlax","WAL",82,31,3.3,1]];
const SAGES=[["Blissey","WAL",90,28,8.6,3],["Gliscor","PHZ",89,27,7.4,2],["Skarmory","SPK",87,30,4.9,1],["Slowbro","WAL",86,29,5.6,2],["Clodsire","WAL",87,26,6.0,3],["Clefable","WAL",88,27,6.1,2]];
const ROSTERS={};
TEAMS.forEach((t,i)=>{if(t.id===ME)return;if(t.id==="SAF"){ROSTERS.SAF=SAGES.slice(1,6);return}const out=[];for(let k=0;k<5;k++){out.push(POOL[(i*5+k*7)%POOL.length])}ROSTERS[t.id]=out});
const mkMon=a=>({k:"m",n:a[0],ab:a[1],o:a[2],age:a[3],sal:a[4],yrs:a[5]});
const picksOf=id=>[{k:"p",n:`2027 round 1`,t:id,r:1,y:2027},{k:"p",n:`2027 round 2`,t:id,r:2,y:2027},{k:"p",n:`2028 round 1`,t:id,r:1,y:2028}];
const NEED={SAF:"WBK",PEW:"DEF",CER:"ROK",GLD:"WAL",BLK:"WAL",MAH:"PIV",VIO:"ROK",CEL:"PIV",LAV:"DEF",VIR:"SWP",CIN:"WAL",ECR:"WBK",OLI:"PIV",AZA:"SWP",CIA:"ROK"};

/* value model for the trade meter */
function val(a,forTeam){
  if(a.k==="p"){const t=T[a.t];const early=t?(t.l-t.w+5)/10:0.5;return a.r===1?(a.y===2027?26+22*early:30):8+4*early}
  const base=Math.pow(Math.max(0,a.o-70),1.55);const age=a.age<=25?1.15:a.age>=31?0.7:a.age>=29?0.88:1;
  const need=forTeam&&NEED[forTeam]===a.ab?1.2:1;return base*age*need*(1+0.04*Math.min(a.yrs,3));
}

/* ---------- shared state (kept for this session) ---------- */
const X={trade:{team:"SAF",give:[],get:[]},block:["Corviknight","Mandibuzz","Torkoal"],signed:{},offers:{},scout:{left:18,budget:"Standard"},draft:null,game:2,battle:null,speed:1,series:[1,0]};

function capStrip(extra){
  if(typeof capMeter==="function"&&typeof USED==="number"&&Math.abs(USED-usedCap)<0.05)return capMeter(extra);
  return `<span class="capm"><span>Cap room</span><b>${M(CAPX-usedCap)}</b><span class="fitbar" role="img" aria-label="${M(usedCap)} of $${CAPX}M used"><i style="width:${Math.min(100,usedCap/CAPX*100).toFixed(1)}%"></i></span><span>${M(usedCap)} of $${CAPX}M${extra?" · "+extra:""}</span></span>`;
}

/* =====================================================================
   #trades
   ===================================================================== */
function assetKey(a){return a.k==="p"?`p:${a.t}:${a.y}:${a.r}`:`m:${a.n}`}
function myAssets(){return own().map(m=>Object.assign({k:"m"},m)).concat(picksOf(ME))}
function theirAssets(id){return (ROSTERS[id]||[]).map(mkMon).concat(picksOf(id))}
function findAsset(list,key){return list.find(a=>assetKey(a)===key)}
function assetRow(a,side,club){
  const nm=a.k==="p"?`<span class="x-who"><span class="x-pick" aria-hidden="true">R${a.r}</span><span>${a.y} round ${a.r} <span class="x-small">(${a.t})</span></span></span>`:pkA(a,club);
  const bdg=a.k==="p"?`<span class="x-small">Pick</span>`:rbA(a);
  const sal=a.k==="p"?"—":M(a.sal);
  return `<li>${nm}${bdg}<span class="x-sal">${sal}</span><button type="button" class="btn" data-rm="${side}|${E(assetKey(a))}" aria-label="Remove ${E(a.k==="p"?a.y+" round "+a.r+" pick":a.n)}">${I("x")}</button></li>`;
}
function tradeEval(){
  const tr=X.trade,id=tr.team,mine=myAssets(),theirs=theirAssets(id);
  const give=tr.give.map(k=>findAsset(mine,k)).filter(Boolean),get=tr.get.map(k=>findAsset(theirs,k)).filter(Boolean);
  const vIn=give.reduce((s,a)=>s+val(a,id),0),vOut=get.reduce((s,a)=>s+val(a,id),0);
  const salIn=get.reduce((s,a)=>s+(a.sal||0),0),salOut=give.reduce((s,a)=>s+(a.sal||0),0);
  const after=usedCap-salOut+salIn,over=after>CAPX;
  let lv=0,word="Add something",why=[];
  if(give.length||get.length){
    const r=vOut?vIn/vOut:(vIn>0?9:0);
    lv=r<0.7?1:r<0.92?2:r<1.05?3:r<1.3?4:5;
    word=["","No","Unlikely","Close","Likely","Yes"][lv];
    why.push(`They value what you give at <b>${Math.round(vIn)}</b> and what they give at <b>${Math.round(vOut)}</b>.`);
    const need=give.find(a=>a.k==="m"&&NEED[id]===a.ab);if(need)why.push(`${T[id].name} need a ${ROLE_OF[NEED[id]]||NEED[id]}; ${E(need.n)} fills it.`);
    else if(NEED[id])why.push(`They want a ${ROLE_OF[NEED[id]]||NEED[id]} (${NEED[id]}), and nothing here fills that.`);
    const old=give.find(a=>a.k==="m"&&a.age>=30);if(old)why.push(`${E(old.n)} is ${old.age}; they discount Pokémon past prime.`);
  }
  if(!get.length&&!give.length){word="Add something";lv=0}
  if(over){why.unshift(`<b class="x-over">This puts you ${M(after-CAPX)} over the cap.</b>`)}
  return {give,get,vIn,vOut,salIn,salOut,after,over,lv,word,why,id};
}
function tradeBuilder(){
  const tr=X.trade,ev=tradeEval(),mine=myAssets(),theirs=theirAssets(tr.team);
  const opts=(list,chosen,blockFirst)=>{
    const ms=list.filter(a=>a.k==="m"&&!chosen.includes(assetKey(a))),ps=list.filter(a=>a.k==="p"&&!chosen.includes(assetKey(a)));
    return `<option value="">Add Pokémon or pick…</option><optgroup label="Pokémon">${ms.map(a=>`<option value="${E(assetKey(a))}">${E(a.n)} · ${a.ab} ${a.o} · ${M(a.sal)}</option>`).join("")}</optgroup><optgroup label="Draft picks">${ps.map(a=>`<option value="${E(assetKey(a))}">${a.y} round ${a.r}</option>`).join("")}</optgroup>`;
  };
  const list=(side,arr)=>{const rows=arr.map(a=>assetRow(a,side,side==="get"?T[tr.team].name:null)).join("");const empty=4-arr.length;return `<ul class="x-assets" aria-label="${side==="give"?"You give":"You get"}">${rows}${empty===4?`<li class="x-empty">Nothing yet</li>`:""}</ul>`};
  const full=n=>n>=4;
  const sels=`<label class="x-field-lbl">Trade with<select data-team aria-label="Trade with">${TEAMS.filter(t=>t.id!==ME).map(t=>`<option value="${t.id}"${t.id===tr.team?" selected":""}>${E(t.name)} · ${t.strat}</option>`).join("")}</select></label>`;
  const meter=`<div class="x-meter lv${ev.lv}" role="img" aria-label="Will they accept: ${ev.word}">${[1,2,3,4,5].map(i=>`<i class="${i<=ev.lv?"on":""}"></i>`).join("")}</div>`;
  const vchip=ev.lv>=4?chip("growth","check",ev.word):ev.lv===3?chip("decline","alert",ev.word):ev.lv>0?chip("health","x",ev.word):chip("league","deal",ev.word);
  const whyPop=`<strong>Why: ${ev.word}</strong>${ev.why.length?ev.why.map(w=>`<span>${w}</span>`).join(""):"<span>Add Pokémon or picks to either side.</span>"}`;
  return `<div class="x-sides">
    <section class="l-card" aria-labelledby="x-give-h"><div class="l-split"><h2 class="l-card-title" id="x-give-h">You give</h2><span class="x-small">${ev.give.length}/4</span></div>
      ${list("give",ev.give)}
      <select data-add="give" aria-label="Add to what you give"${full(ev.give.length)?" disabled":""}>${opts(mine,tr.give)}</select></section>
    <section class="l-card" aria-labelledby="x-get-h"><div class="l-split"><h2 class="l-card-title" id="x-get-h">You get</h2><span class="x-small">${ev.get.length}/4</span></div>
      ${list("get",ev.get)}
      <select data-add="get" aria-label="Add to what you get"${full(ev.get.length)?" disabled":""}>${opts(theirs,tr.get)}</select></section>
  </div>
  <section class="l-card" aria-label="Trade summary">
    <div class="l-grid" style="--card-min:260px;grid-auto-rows:auto">
      <div class="l-stack tight"><span class="cap">Cap after trade</span>
        <div class="x-before-after"><span>Your payroll</span><b>${M(usedCap)}</b><span class="x-arrow" aria-label="to">→</span><b class="${ev.over?"x-over":""}">${M(ev.after)}</b>
        <span>Cap room</span><b>${M(CAPX-usedCap)}</b><span class="x-arrow" aria-label="to">→</span><b class="${ev.over?"x-over":""}">${M(CAPX-ev.after)}</b></div></div>
      <div class="l-stack tight"><span class="l-row"><span class="cap">Will they accept?</span>${inf("Why: "+ev.word,whyPop)}</span>
        <div class="x-verdict">${meter}${vchip}</div></div>
    </div>
    <div class="l-actions">${btn("Propose",`data-act="propose"${(!ev.give.length&&!ev.get.length)||ev.over?' aria-disabled="true"':""}`,true)}${btn("Balance it",'data-act="balance"')}${btn("Clear",'data-act="clear"')}</div>
  </section>`;
}
function viewTrades(){
  const t=T[X.trade.team],fit=own().find(m=>m.ab===NEED[t.id]);
  const blockRows=X.block.map(n=>own().find(m=>m.n===n)).filter(Boolean).map(m=>{
    const asks=TEAMS.filter(x=>x.id!==ME&&NEED[x.id]===m.ab).slice(0,2);
    return `<tr><td>${pkA(m)}</td><td>${rbA(m)}</td><td class="num">${m.age}</td><td class="num">${M(m.sal)} · ${m.yrs}y</td><td>${asks.length?peek(`${asks.length} ${asks.length===1?"club":"clubs"}`,`<strong>Asking about ${E(m.n)}</strong>${asks.map(a=>`<span>${E(a.name)} · need ${a.strat==="Stall"?"a Wall":ROLE_OF[m.ab]}</span>`).join("")}`):'<span class="x-muted">None yet</span>'}</td><td>${btn("Shop",`data-shop="${E(m.n)}" aria-label="Shop ${E(m.n)} in the trade builder"`)}</td></tr>`}).join("");
  return `<div class="l-page" data-xpage="trades">${hd("Trades",`${E(t.name)} need a ${ROLE_OF[NEED[t.id]]||NEED[t.id]}.${fit?` Your ${E(fit.n)} fits.`:""} You have ${M(CAPX-usedCap)} of cap room.`)}
  <div class="l-stack loose" id="x-builder">${tradeBuilder()}</div>
  <section class="l-section" aria-labelledby="x-blk"><h2 id="x-blk">Trade block</h2>
    ${table([["Pokémon","34%"],["Role","184px"],["Age","56px","num"],["Salary","120px","num"],["Interest","110px"],["","148px"]],blockRows||`<tr><td colspan="6" class="x-muted">Nobody on the block.</td></tr>`,720,"Trade block")}
  </section></div>`;
}
function rerenderBuilder(view,focusSel){const b=view.querySelector("#x-builder");if(!b)return;b.innerHTML=tradeBuilder();if(focusSel){const f=b.querySelector(focusSel);if(f)f.focus()}}
viewTrades.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  view.addEventListener("change",e=>{
    const s=e.target;
    if(s.matches("[data-team]")){X.trade={team:s.value,give:X.trade.give,get:[]};rerenderBuilder(view,"[data-team]");return}
    if(s.matches("[data-add]")&&s.value){const side=s.dataset.add;if(X.trade[side].length<4)X.trade[side].push(s.value);rerenderBuilder(view,`[data-add="${side}"]`)}
  });
  view.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b||b.getAttribute("aria-disabled")==="true")return;
    if(b.dataset.rm){const [side,key]=b.dataset.rm.split("|");X.trade[side]=X.trade[side].filter(k=>k!==key);rerenderBuilder(view,`[data-add="${side}"]`);return}
    if(b.dataset.shop){const k="m:"+b.dataset.shop;if(!X.trade.give.includes(k)&&X.trade.give.length<4)X.trade.give.push(k);rerenderBuilder(view);const g=view.querySelector('[data-add="give"]');if(g){g.scrollIntoView({block:"center"});g.focus()}return}
    const act=b.dataset.act;if(!act)return;
    if(act==="clear"){X.trade.give=[];X.trade.get=[];rerenderBuilder(view,'[data-act="clear"]');return}
    if(act==="propose"){proposeDialog(view);return}
    if(act==="balance"){balanceDialog(view)}
  });
};
function proposeDialog(view){
  const ev=tradeEval(),t=T[ev.id],yes=ev.lv>=4;
  const counter=!yes&&ev.lv===3;
  const body=`<div class="x-reply">${yes?I("check"):counter?I("alert"):I("x")}<span>${yes?`<b>${E(t.name)} accept.</b> ${ev.get.length?ev.get.map(a=>E(a.k==="p"?a.y+" round "+a.r+" pick":a.n)).join(" and ")+(ev.get.length===1?" joins":" join"):"Nothing"} the Volts.`:counter?`<b>${E(t.name)}: “Close, but not quite.”</b> They'd do it if you add your 2027 round 2 pick.`:`<b>${E(t.name)} decline.</b> “That doesn't help us win this year.”`}</span></div>
  <div class="x-before-after"><span>Cap room</span><b>${M(CAPX-usedCap)}</b><span class="x-arrow" aria-label="to">→</span><b>${M(CAPX-(yes?ev.after:usedCap))}</b></div>`;
  dialog({title:yes?"Trade accepted":counter?"They want a bit more":"Trade declined",body,
    actions:yes?[{k:"close",label:"Done",go:true}]:counter?[{k:"add",label:"Add the pick",go:true},{k:"close",label:"Not now"}]:[{k:"close",label:"OK",go:true}],
    on:k=>{if(k==="add"){const key=`p:${ME}:2027:2`;if(!X.trade.give.includes(key)&&X.trade.give.length<4)X.trade.give.push(key);rerenderBuilder(view)}},
    done:()=>{if(yes){usedCap=Math.round(ev.after*10)/10;
      OWN=own().filter(m=>!X.trade.give.includes("m:"+m.n)).concat(ev.get.filter(a=>a.k==="m").map(a=>({n:a.n,ab:a.ab,o:a.o,age:a.age,sal:a.sal,yrs:a.yrs})));
      X.block=X.block.filter(n=>!X.trade.give.includes("m:"+n));X.trade.give=[];X.trade.get=[];
      refresh(view,viewTrades())}},
    focus:()=>view.querySelector('[data-act="propose"]')||view.querySelector("h1")});
}
function balanceDialog(view){
  const ev=tradeEval();
  if(!ev.get.length){dialog({title:"Pick what you want first",body:`<p class="muted">Add at least one Pokémon or pick to “You get”, and ${E(T[ev.id].name)} will say what they'd need back.</p>`});return}
  const gap=ev.vOut*1.08-ev.vIn;
  if(gap<=0){dialog({title:"Already balanced",body:`<p class="muted">${E(T[ev.id].name)} would likely take this as it stands. Propose it.</p>`});return}
  const mine=myAssets().filter(a=>!X.trade.give.includes(assetKey(a)));
  const cand=mine.map(a=>({a,v:val(a,ev.id)})).filter(x=>x.v>=gap).sort((p,q)=>p.v-q.v)[0]||mine.map(a=>({a,v:val(a,ev.id)})).sort((p,q)=>q.v-p.v)[0];
  const a=cand.a,nm=a.k==="p"?`your ${a.y} round ${a.r} pick`:a.n;
  dialog({title:"What would make this work",body:`<div class="x-reply">${I("deal")}<span><b>${E(T[ev.id].name)}:</b> “Add ${E(nm)} and we have a deal.”</span></div>${a.k==="m"?`<div class="l-row">${icon(a.n)}<b>${E(a.n)}</b>${rb(a.ab,a.o)}<span class="x-small">${M(a.sal)} · ${a.yrs}y · age ${a.age}</span></div>`:""}`,
    actions:[{k:"add",label:"Add it",go:true},{k:"close",label:"Cancel"}],
    on:k=>{if(k==="add"&&X.trade.give.length<4){X.trade.give.push(assetKey(a));rerenderBuilder(view)}},
    focus:()=>view.querySelector('[data-act="propose"]')});
}

/* =====================================================================
   #freeagents
   ===================================================================== */
const FA=[["Heatran","ROK",88,30,6.4,2,"Open"],["Starmie","DEF",83,25,3.1,2,"Keen"],["Scizor","PIV",86,29,5.2,2,"Cool"],["Clefable","WAL",85,28,4.2,3,"Open"],["Weavile","SCF",82,26,3.0,1,"Keen"],["Kingdra","RAIN+",80,28,2.4,1,"Open"],["Amoonguss","WAL",81,31,2.0,1,"Keen"],["Bisharp","WBK",84,27,4.0,2,"Cool"],["Ninetales","SUN",77,24,1.2,2,"Keen"],["Forretress","SPK",79,32,1.4,1,"Open"],["Aerodactyl","ROK",78,29,1.6,1,"Open"],["Gengar","WBK",83,29,3.6,1,"Cool"]].map(a=>({n:a[0],ab:a[1],o:a[2],age:a[3],ask:a[4],yrs:a[5],int:a[6]}));
const INT={Keen:["growth","up","Keen",0.9],Open:["deal","deal","Open",1],Cool:["decline","alert","Cool",1.12]};
const FAF={role:"all",sort:"o"};
function faRows(){
  let L=FA.filter(f=>FAF.role==="all"||f.ab===FAF.role);
  L=L.slice().sort((a,b)=>FAF.sort==="age"?a.age-b.age:FAF.sort==="ask"?a.ask-b.ask:b.o-a.o);
  if(!L.length)return `<tr><td colspan="6" class="x-muted">No free agents in this role.</td></tr>`;
  return L.map(f=>{const it=INT[f.int],s=X.signed[f.n];
    return `<tr><td>${pk(f.n,{club:1,title:f.n+" · free agent",rows:[["Role",rname(f.ab)+" · "+f.o],["Age",f.age],["Asking",M(f.ask)+" × "+f.yrs+" yrs"],["Interest",f.int]]})}</td><td>${rb(f.ab,f.o)}</td><td class="num">${f.age}</td><td class="num">${M(f.ask)} × ${f.yrs}y</td><td>${chip(it[0],it[1],it[2])}</td><td>${s?chip("deal","check","Signed"):btn("Sign",`data-sign="${E(f.n)}" aria-label="Sign ${E(f.n)}"`)}</td></tr>`}).join("");
}
function viewFA(){
  const roles=[...new Set(FA.map(f=>f.ab))];
  return `<div class="l-page">${hd("Free agents","Starmie is the best fit for your empty Hazard remover backup, and he's keen.")}
  <div class="x-capwrap">${capStrip("14 of 18 spots")}</div>
  <div class="l-row">
    <label class="x-field-lbl">Role<select data-farole>${[["all","All roles"]].concat(roles.map(r=>[r,`${r} · ${ROLE_OF[r]||r}`])).map(o=>`<option value="${o[0]}"${FAF.role===o[0]?" selected":""}>${o[1]}</option>`).join("")}</select></label>
    <label class="x-field-lbl">Sort<select data-fasort>${[["o","Rating"],["age","Youngest"],["ask","Cheapest"]].map(o=>`<option value="${o[0]}"${FAF.sort===o[0]?" selected":""}>${o[1]}</option>`).join("")}</select></label>
  </div>
  <div class="" id="x-fa">${table([["Pokémon","32%"],["Role","184px"],["Age","56px","num"],["Asking","120px","num"],["Interest","120px"],["","148px"]],faRows(),720,"Free agents")}</div></div>`;
}
viewFA.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  const redraw=f=>{view.querySelector("#x-fa").innerHTML=table([["Pokémon","32%"],["Role","184px"],["Age","56px","num"],["Asking","120px","num"],["Interest","120px"],["","148px"]],faRows(),720,"Free agents");};
  view.addEventListener("change",e=>{if(e.target.matches("[data-farole]")){FAF.role=e.target.value;redraw()}if(e.target.matches("[data-fasort]")){FAF.sort=e.target.value;redraw()}});
  view.addEventListener("click",e=>{const b=e.target.closest("[data-sign]");if(b)signDialog(view,FA.find(f=>f.n===b.dataset.sign))});
};
function signDialog(view,f){
  let sal=f.ask,yrs=f.yrs,state="open";
  const it=INT[f.int];
  const body=()=>`<div class="l-row">${icon(f.n)}<b>${E(f.n)}</b>${rb(f.ab,f.o)}<span class="x-small">age ${f.age}</span>${chip(it[0],it[1],it[2])}</div>
   <p class="muted">Asking ${M(f.ask)} a year for ${f.yrs} ${f.yrs===1?"year":"years"}.</p>
   <div class="x-form">
     <div class="x-field-lbl">Salary per year<div class="x-steps"><button type="button" class="btn" data-xd="dn" aria-label="Lower offer by $0.2M">−</button><output aria-live="polite">${M(sal)}</output><button type="button" class="btn" data-xd="up" aria-label="Raise offer by $0.2M">+</button></div></div>
     <label class="x-field-lbl">Years<select data-yrs>${[1,2,3].map(y=>`<option${y===yrs?" selected":""}>${y}</option>`).join("")}</select></label>
   </div>
   <div class="x-before-after"><span>Cap room after signing</span><b>${M(CAPX-usedCap)}</b><span class="x-arrow" aria-label="to">→</span><b class="${usedCap+sal>CAPX?"x-over":""}">${M(CAPX-usedCap-sal)}</b></div>
   <div class="x-reply" aria-live="polite">${reply()}</div>`;
  const reply=()=>state==="yes"?`${I("check")}<span><b>${E(f.n)} signs.</b> ${M(sal)} × ${yrs} ${yrs===1?"year":"years"}. He joins your backups.</span>`
    :state==="no"?`${I("x")}<span><b>“I can get more elsewhere.”</b> Try closer to ${M(f.ask*it[3])}${yrs!==f.yrs?` or ${f.yrs} years`:""}.</span>`
    :state==="cap"?`${I("alert")}<span><b>Over the cap.</b> Clear room with a trade first.</span>`
    :`${I("deal")}<span>Set an offer and send it. ${f.int==="Keen"?"He likes your club and may take a little less.":f.int==="Cool"?"He's cool on you; expect to pay over the ask.":"He'll take about his ask."}</span>`;
  dialog({title:`Sign ${E(f.n)}`,change:(e,d)=>{if(e.target.matches("[data-yrs]")){yrs=+e.target.value;if(state!=="yes")state="open";d.querySelector("[data-body]").innerHTML=body();d.querySelector("[data-yrs]").focus()}},body:body(),actions:[{k:"offer",label:"Send offer",go:true},{k:"close",label:"Cancel"}],
    on:(k,dl)=>{
      if(k==="up"||k==="dn"){if(state==="yes")return false;sal=Math.max(0.5,Math.round((sal+(k==="up"?.2:-.2))*10)/10);state="open"}
      if(k==="offer"){
        if(state==="yes")return true;
        if(usedCap+sal>CAPX)state="cap";
        else{const need=f.ask*it[3]*(yrs===f.yrs?1:yrs>f.yrs?1.06:1.03);state=sal>=need-0.001?"yes":"no"}
        if(state==="yes"){usedCap=Math.round((usedCap+sal)*10)/10;X.signed[f.n]={sal,yrs};
          const acts=dl.querySelector("[data-acts]");acts.innerHTML=btn("Done",'data-xd="close"',true)+btn("Back to list",'data-xd="close"');acts.querySelector(".btn").focus()}
      }
      dl.querySelector("[data-body]").innerHTML=body();
      const tgt=dl.querySelector(`[data-xd="${k}"]`);if(tgt)tgt.focus();
      return false;
    },
    done:()=>{if(X.signed[f.n])refresh(view,viewFA())},
    focus:()=>view.querySelector(`[data-sign="${CSS.escape(f.n)}"]`)||view.querySelector("h1")});
}

/* =====================================================================
   #offers
   ===================================================================== */
const OFFERS=[
 {id:"o1",team:"PEW",exp:"2 days",give:[["Corviknight"]],get:[{k:"p",t:"PEW",y:2027,r:2}],why:"Pewter need a Hazard remover for their Hazard Stack and are 5–0, so their round 2 pick will be late."},
 {id:"o2",team:"SAF",exp:"Today",give:[["Dragapult"]],get:[{k:"m",a:["Clefable","WAL",88,27,6.1,2]},{k:"p",t:"SAF",y:2028,r:2}],why:"Saffron want a Wallbreaker to stop mirror stall games. Clefable is their spare Wall."},
 {id:"o3",team:"GLD",exp:"3 days",give:[["Tyranitar"],{k:"p",t:"VER",y:2027,r:2}],get:[{k:"m",a:["Magnezone","WBK",85,28,5.2,2]}],why:"Goldenrod want a bulky Wall-breaker for Volt-Turn. They see Tyranitar at 30 as a one-year rental."}
];
function offerParts(o){
  const ownL=own();
  const give=o.give.map(g=>Array.isArray(g)?Object.assign({k:"m"},ownL.find(m=>m.n===g[0])||{n:g[0],ab:"—",o:0,sal:0,yrs:0}):Object.assign({},g));
  const get=o.get.map(g=>g.k==="m"?Object.assign(mkMon(g.a),{club:T[o.team].name}):Object.assign({},g));
  const dSal=get.reduce((s,a)=>s+(a.sal||0),0)-give.reduce((s,a)=>s+(a.sal||0),0);
  return {give,get,dSal};
}
const miniRow=a=>a.k==="p"?`<li><span class="x-pick" aria-hidden="true">R${a.r}</span><span>${a.y} round ${a.r} pick <span class="x-small">(${a.t})</span></span></li>`:`<li>${a.club?pkA(a,a.club):pkA(a)}${a.ab&&a.o?rb(a.ab,a.o):""}</li>`;
function offerCard(o){
  const t=T[o.team],p=offerParts(o),st=X.offers[o.id];
  const room=CAPX-usedCap;
  const acts=st?`<div class="x-actslot x-3">${st==="acc"?chip("growth","check","Accepted"):chip("league","x","Declined")}</div>`
    :`<div class="x-actslot x-3"><div class="l-actions">${btn("Accept",`data-acc="${o.id}"`,true)}${btn("Counter",`data-ctr="${o.id}"`)}${btn("Decline",`data-dec="${o.id}"`)}</div></div>`;
  return `<article class="l-card" aria-labelledby="x-${o.id}">
    <div class="l-split">${chip("deal","deal","Offer")}<span class="tag ${o.exp==="Today"?"t-dtd":""}">${I("clock")}Expires ${o.exp==="Today"?"today":"in "+o.exp}</span></div>
    <div class="l-stack tight"><h2 class="l-card-title" id="x-${o.id}">${E(t.name)}</h2><span class="x-small">${t.w}–${t.l} · ${t.strat} · Why ${inf("Why "+t.name+" offer this",`<strong>${E(t.name)}</strong><span>${o.why}</span>`)}</span></div>
    <div class="x-offer-cols"><div class="l-stack tight"><span class="cap">You give</span><ul class="x-mini">${p.give.map(miniRow).join("")}</ul></div>
      <div class="l-stack tight"><span class="cap">You get</span><ul class="x-mini">${p.get.map(miniRow).join("")}</ul></div></div>
    <div class="x-before-after"><span>Cap room</span><b>${M(room)}</b><span class="x-arrow" aria-label="to">→</span><b class="${room-p.dSal<0?"x-over":""}">${M(room-p.dSal)}</b></div>
    ${acts}</article>`;
}
function viewOffers(){
  return `<div class="l-page">${hd("Offers","Clubs send offers during the week. Saffron's ends today, and you play them on Saturday.")}
  <div class="l-grid" style="--card-min:420px" id="x-offers">${OFFERS.map(offerCard).join("")}</div></div>`;
}
viewOffers.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  const redraw=(id,focusSel)=>{const g=view.querySelector("#x-offers");g.innerHTML=OFFERS.map(offerCard).join("");return g};
  view.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    if(b.dataset.ctr){const o=OFFERS.find(x=>x.id===b.dataset.ctr),p=offerParts(o);
      X.trade={team:o.team,give:p.give.map(assetKey),get:p.get.map(a=>a.k==="p"?`p:${a.t}:${a.y}:${a.r}`:assetKey(a))};
      if(!ROSTERS[o.team].some(r=>p.get.some(a=>a.n===r[0])))p.get.filter(a=>a.k==="m").forEach(a=>ROSTERS[o.team].push([a.n,a.ab,a.o,a.age,a.sal,a.yrs]));
      location.hash="#trades";return}
    const id=b.dataset.acc||b.dataset.dec;if(!id)return;const o=OFFERS.find(x=>x.id===id),t=T[o.team],p=offerParts(o),acc=!!b.dataset.acc;
    const nm=a=>a.k==="p"?`${a.y} round ${a.r} pick`:a.n;
    dialog({title:acc?`Accept ${E(t.name)}' offer?`:`Decline ${E(t.name)}' offer?`,
      body:`<p class="muted">You give <b>${p.give.map(nm).map(E).join(" and ")}</b> and get <b>${p.get.map(nm).map(E).join(" and ")}</b>.${acc?` Cap room goes to ${M(CAPX-usedCap-p.dSal)}.`:" They won't ask again this week."}</p>`,
      actions:[{k:"yes",label:acc?"Accept trade":"Decline",go:true},{k:"close",label:"Keep open"}],
      on:k=>{if(k==="yes"){X.offers[id]=acc?"acc":"dec";if(acc){usedCap=Math.round((usedCap+p.dSal)*10)/10;const gone=p.give.filter(a=>a.k==="m").map(a=>a.n);OWN=own().filter(m=>!gone.includes(m.n)).concat(p.get.filter(a=>a.k==="m").map(a=>({n:a.n,ab:a.ab,o:a.o,age:a.age,sal:a.sal,yrs:a.yrs})))}redraw(id)}},
      focus:()=>view.querySelector('[data-acc]')||view.querySelector("h1")});
  });
};

/* =====================================================================
   #scouting  +  #draft (share the prospect class)
   ===================================================================== */
const CLASS=[["Larvitar","WBK",84,"A",19],["Deino","SWP",82,"AA",19],["Beldum","ROK",80,"A",20],["Ralts","WBK",79,"AA",19],["Axew","SWP",78,"B",20],["Bagon","SWP",81,"A",20],["Goomy","WAL",76,"AA",19],["Jangmo-o","SWP",77,"B",21],["Riolu","SWP",75,"B",20],["Ferroseed","SPK",76,"B",21],["Sandile","WBK",74,"A",20],["Honedge","SWP",73,"A",19],["Mareanie","WAL",75,"C",21],["Dratini","SWP",72,"AA",19],["Magnemite","PIV",72,"B",20],["Litwick","WBK",70,"B",20],["Skrelp","RAIN+",69,"C",21],["Rockruff","SCF",71,"C",20]]
 .map((a,i)=>({n:a[0],ab:a[1],o:a[2],pot:a[3],age:a[4],fz:[6,8,5,9,7,4,10,6,8,5,9,7,6,11,5,6,7,8][i],sk:[2,1,3,0,1,2,0,1,0,2,1,0,1,0,2,1,0,0][i],rank:i+1}));
const GR=["F","D","C","B","A","AA","AAA"];
const rng=p=>{const lo=p.o-Math.ceil(p.fz*.6),hi=p.o+Math.floor(p.fz*.4);return [Math.max(40,lo),Math.min(99,hi)]};
const potRange=p=>{const i=GR.indexOf(p.pot),w=p.fz>=8?2:p.fz>=4?1:0;return [GR[Math.max(0,i-w)],GR[Math.min(6,i+(w>1?1:0))]]};
const conf=p=>p.fz<=3?["High",90]:p.fz<=6?["Medium",60]:["Low",30];
function scoutRows(){
  return CLASS.map(p=>{const r=rng(p),pr=potRange(p),c=conf(p),cost=3,none=X.scout.left<cost;
    return `<tr><td class="num">${p.rank}</td><td>${pkP(p)}</td><td>${rbRange(p.ab,r[0],r[1])}</td><td><span class="x-gr" role="img" aria-label="Growth ceiling ${pr[0]===pr[1]?pr[0]:pr[0]+" to "+pr[1]}">${grade(pr[0])}${pr[0]!==pr[1]?`<span aria-hidden="true">–</span>${grade(pr[1])}`:""}</span></td><td class="num">${p.age}</td><td><span class="x-conf"><span class="fitbar" role="img" aria-label="Confidence ${c[0]}"><i style="width:${c[1]}%"></i></span><span>${c[0]}</span></span></td><td>${p.fz<=1?chip("scout","check","Known"):btn(`Scout · ${cost}`,`data-scout="${E(p.n)}"${none?' aria-disabled="true"':""} aria-label="Scout ${E(p.n)} for ${cost} points"`)}</td></tr>`}).join("");
}
function pkP(p){if(!p)return "";const r=rng(p),pr=potRange(p);return pk(p.n,{club:1,title:p.n+" · prospect",rows:[["Projected",`${rname(p.ab)} ${r[0]===r[1]?r[0]:r[0]+"–"+r[1]}`],["Ceiling",pr[0]===pr[1]?pr[0]:pr[0]+"–"+pr[1]],["Age",p.age],["Confidence",conf(p)[0]]]})}
const SCOLS=[["#","64px","num"],["Prospect","26%"],["Projected","208px"],["Ceiling","136px"],["Age","56px","num"],["Confidence","136px"],["","156px"]];
function viewScouting(){
  const left=X.scout.left;
  return `<div class="l-page">${hd("Scouting","Ralts has the widest range near your projected pick. A scout narrows it.")}
  <div class="l-grid" style="--card-min:260px;grid-auto-rows:auto">
    <div class="l-card"><span class="cap">Points this week</span><div class="x-points"><span class="fitbar" role="img" aria-label="${left} of 30 points left"><i style="width:${left/30*100}%"></i></span><b class="x-num" id="x-left">${left} / 30</b></div><span class="x-small">Refills on Monday. A scout costs 3 points and narrows the ranges.</span></div>
    <div class="l-card"><label class="x-field-lbl">Scouting budget<select data-budget>${[["Low","Low · $0.5M · 20 pts"],["Standard","Standard · $1.0M · 30 pts"],["High","High · $2.0M · 45 pts"]].map(o=>`<option value="${o[0]}"${X.scout.budget===o[0]?" selected":""}>${o[1]}</option>`).join("")}</select></label><span class="x-small l-reserve" id="x-budget-note">${budgetNote()}</span></div>
  </div>
  <div class="" id="x-class">${table(SCOLS,scoutRows(),880,"Draft class")}</div></div>`;
}
function budgetNote(){return X.scout.budget==="Standard"?"Current budget. Changes start next week.":`Starts next week. ${X.scout.budget==="High"?"Costs $1.0M more against the cap.":"Saves $0.5M against the cap."}`}
viewScouting.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  view.addEventListener("change",e=>{if(e.target.matches("[data-budget]")){X.scout.budget=e.target.value;view.querySelector("#x-budget-note").textContent=budgetNote()}});
  view.addEventListener("click",e=>{const b=e.target.closest("[data-scout]");if(!b||b.getAttribute("aria-disabled")==="true")return;
    const p=CLASS.find(x=>x.n===b.dataset.scout),before=rng(p),bp=potRange(p);
    X.scout.left-=3;p.fz=Math.max(1,Math.floor(p.fz*0.55));p.sk++;
    const r=rng(p),pr=potRange(p);
    view.querySelector("#x-class").innerHTML=table(SCOLS,scoutRows(),880,"Draft class");
    view.querySelector("#x-left").textContent=`${X.scout.left} / 30`;view.querySelector(".x-points .fitbar i").style.width=(X.scout.left/30*100)+"%";
    
    dialog({title:`Report: ${E(p.n)}`,body:`<div class="l-row">${icon(p.n)}<b>${E(p.n)}</b>${rbRange(p.ab,r[0],r[1])}</div>
      <div class="x-before-after"><span>Projected ${p.ab}</span><b>${before[0]}–${before[1]}</b><span class="x-arrow" aria-label="to">→</span><b>${r[0]===r[1]?r[0]:r[0]+"–"+r[1]}</b>
      <span>Growth ceiling</span><b>${bp[0]}–${bp[1]}</b><span class="x-arrow" aria-label="to">→</span><b>${pr[0]===pr[1]?pr[0]:pr[0]+"–"+pr[1]}</b></div>
      <p class="muted">${p.pot==="AA"||p.pot==="AAA"?"Scouts like the growth curve: worth a first-round pick.":"Solid, but the ceiling looks capped. A second-round value."}</p>`,
      focus:()=>view.querySelector(`[data-scout="${CSS.escape(p.n)}"]`)||view.querySelector("h1")});
  });
};

/* draft: projected order = reverse standings; picks 1-4 by lottery among non-playoff clubs */
function standingsSorted(list){return list.slice().sort((a,b)=>(b.w-a.w)||((b.gw-b.gl)-(a.gw-a.gl))||a.name.localeCompare(b.name))}
function draftInit(){
  const order=standingsSorted(TEAMS).reverse().map(t=>t.id);
  const st={order,on:6,taken:{},mine:order.indexOf(ME)};
  ["Larvitar","Deino","Bagon","Beldum","Ralts","Goomy"].forEach((n,i)=>st.taken[n]=i);
  return st;
}
function aiPick(st){const left=CLASS.filter(p=>st.taken[p.n]===undefined);const p=left[(st.on*7)%Math.min(3,left.length)]||left[0];if(p)st.taken[p.n]=st.on;st.on++;return p}
function draftOrderRows(st){
  return st.order.map((id,i)=>{const t=T[id],sel=Object.keys(st.taken).find(n=>st.taken[n]===i),now=i===st.on;
    return `<tr class="${id===ME?"cur":""}${i===3?" x-cut":""}"><td class="num">${i+1}</td><td>${tcell(t,false)}</td><td>${sel?pkP(CLASS.find(c=>c.n===sel)):now?chip("scout","clock","On the clock"):`<span class="x-muted">${i<4?"Lottery":"—"}</span>`}</td></tr>`}).join("");
}
function boardRows(st){
  const myTurn=st.on===st.mine;
  return CLASS.map(p=>{const r=rng(p),pr=potRange(p),tk=st.taken[p.n];
    return `<tr class="${tk!==undefined?"x-dim":""}"><td class="num">${p.rank}</td><td>${pkP(p)}</td><td>${rbRange(p.ab,r[0],r[1])}</td><td><span class="x-gr" role="img" aria-label="Ceiling ${pr[0]} to ${pr[1]}">${grade(pr[0])}${pr[0]!==pr[1]?`<span aria-hidden="true">–</span>${grade(pr[1])}`:""}</span></td><td>${tk!==undefined?`<span class="x-small">Taken · #${tk+1} ${st.order[tk]}</span>`:btn("Draft",`data-draft="${E(p.n)}"${myTurn?"":' aria-disabled="true"'} aria-label="Draft ${E(p.n)}"`,myTurn)}</td></tr>`}).join("");
}
const BCOLS=[["#","64px","num"],["Prospect","30%"],["Projected","208px"],["Ceiling","136px"],["","168px"]];
function clockCard(st){
  const done=st.on>=st.order.length,t=done?null:T[st.order[st.on]],mine=st.on===st.mine,past=st.on>st.mine;
  const myPk=Object.keys(st.taken).find(n=>st.taken[n]===st.mine);
  const line=done?"Round 1 is complete.":mine?"You're on the clock. Pick from the big board.":`${E(t.name)} are picking. Your pick is #${st.mine+1}, ${st.mine-st.on} ${st.mine-st.on===1?"pick":"picks"} away.`;
  return `<section class="l-card${done?"":" x-live"}" aria-label="Pick in progress"><div class="x-clock"><span class="x-ring">${I(done?"check":"clock")}</span><div class="l-stack tight"><b class="l-card-title">${done?"Draft complete":`Pick ${st.on+1} · ${mine?"Vermilion Volts":E(t.name)}`}</b><span class="x-small l-reserve" aria-live="polite">${line}${myPk?` You took ${E(myPk)} at #${st.mine+1}.`:""}</span></div></div>
   <div class="l-actions">${btn("Next pick",`data-dr="next"${done||mine?' aria-disabled="true"':""}`)}${btn(past||done?"Sim to end":"Sim to my pick",`data-dr="${past?"end":"mine"}"${done||mine?' aria-disabled="true"':""}`,!mine&&!done)}</div></section>`;
}
function viewDraft(){
  const st=X.draft||(X.draft=draftInit());
  return `<div class="l-page">${hd("Draft","Mock draft from today's standings. Picks 1–4 go by lottery among the 8 clubs outside the playoffs.")}
   <div id="x-clock">${clockCard(st)}</div>
   <div class="x-draft">
     <section class="l-section" aria-labelledby="x-ord"><h2 id="x-ord">Order</h2><div class="" id="x-order">${table([["#","64px","num"],["Club","88px"],["Selection","auto"]],draftOrderRows(st),300,"Round 1 order")}</div><span class="x-small">Your picks: round 1 #${st.mine+1}, round 2 #${16+st.mine+1}, 2028 round 1.</span></section>
     <section class="l-section" aria-labelledby="x-bb"><h2 id="x-bb">Big board</h2><div class="" id="x-board">${table(BCOLS,boardRows(st),640,"Big board")}</div></section>
   </div></div>`;
}
viewDraft.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  const st=()=>X.draft;
  const redraw=f=>{const s=st();view.querySelector("#x-clock").innerHTML=clockCard(s);view.querySelector("#x-order").innerHTML=table([["#","64px","num"],["Club","88px"],["Selection","auto"]],draftOrderRows(s),300,"Round 1 order");view.querySelector("#x-board").innerHTML=table(BCOLS,boardRows(s),640,"Big board");if(f){const e=view.querySelector(f);if(e)e.focus()}};
  view.addEventListener("click",e=>{const b=e.target.closest("button");if(!b||b.getAttribute("aria-disabled")==="true")return;const s=st();
    if(b.dataset.dr==="next"){aiPick(s);redraw('[data-dr="next"]')}
    else if(b.dataset.dr==="mine"||b.dataset.dr==="end"){const made=[];const stop=b.dataset.dr==="mine"?s.mine:s.order.length;while(s.on<stop){const p=aiPick(s);if(p)made.push([s.on-1,p])}
      redraw();dialog({title:b.dataset.dr==="mine"?"You're on the clock":"Round 1 complete",body:`<ol class="x-mini">${made.map(m=>`<li>${icon(m[1].n)}<span><b>#${m[0]+1} ${E(T[s.order[m[0]]].name)}</b> took ${E(m[1].n)}</span></li>`).join("")}</ol>${b.dataset.dr==="mine"?`<p class="muted">Best left by your board: <b>${E((CLASS.find(p=>s.taken[p.n]===undefined)||{n:"—"}).n)}</b>.</p>`:""}`,
        focus:()=>view.querySelector('[data-draft]:not([aria-disabled])')||view.querySelector('[data-dr]')})}
    else if(b.dataset.draft){const p=CLASS.find(x=>x.n===b.dataset.draft),r=rng(p);
      dialog({title:`Draft ${E(p.n)} at #${s.mine+1}?`,body:`<div class="l-row">${icon(p.n)}<b>${E(p.n)}</b>${rbRange(p.ab,r[0],r[1])}<span class="x-small">age ${p.age}</span></div><p class="muted">Rookie deal: $0.8M × 3 years. Cap room after: ${M(CAPX-usedCap-0.8)}.</p>`,
        actions:[{k:"yes",label:"Draft him",go:true},{k:"close",label:"Keep looking"}],
        on:k=>{if(k==="yes"){s.taken[p.n]=s.mine;s.on++;usedCap=Math.round((usedCap+0.8)*10)/10;redraw()}},
        focus:()=>view.querySelector('[data-dr="end"]')||view.querySelector("h1")})}
  });
};

/* =====================================================================
   #standings
   ===================================================================== */
const diff=t=>{const d=t.gw-t.gl;return d>0?"+"+d:d<0?"−"+Math.abs(d):"0"};
const strk=s=>`<span aria-label="${s[0]==="W"?"Won":"Lost"} ${s.slice(1)}">${s}</span>`;
function viewStandings(){
  const tables=DIVS.map(dv=>{const L=standingsSorted(TEAMS.filter(t=>t.div===dv));const lead=L[0];
    const rows=L.map((t,i)=>`<tr class="${t.id===ME?"cur":""}"><td>${tcell(t)}</td><td class="num">${t.w}</td><td class="num">${t.l}</td><td class="num">${i===0?"—":((lead.w-t.w+(t.l-lead.l))/2).toFixed(1).replace(".0","")}</td><td class="num">${diff(t)}</td><td>${strk(t.strk)}</td><td>${i===0?chip("league","trophy","Leads"):""}</td></tr>`).join("");
    return `<section class="l-section" aria-labelledby="x-${dv.replace(/\s/g,"")}"><h2 id="x-${dv.replace(/\s/g,"")}">${dv}</h2>${table([["Club","38%"],["W","44px","num"],["L","44px","num"],["Back","72px","num"],["Games "+inf("About games","<strong>Games ±</strong><span>Games won minus games lost across all best-of-3 series.</span>"),"72px","num"],["Streak","88px"],["","136px"]],rows,600,dv+" standings")}</section>`}).join("");
  return `<div class="l-page">${hd("Standings","Week 6 of 14. You lead Kanto East by a series over Saffron, and you play them on Saturday.")}<div class="l-grid" style="--card-min:520px;grid-auto-rows:auto">${tables}</div></div>`;
}

/* =====================================================================
   #playoffs
   ===================================================================== */
function seeds(){
  const leaders=DIVS.map(d=>standingsSorted(TEAMS.filter(t=>t.div===d))[0]);
  const top=standingsSorted(leaders);const rest=standingsSorted(TEAMS.filter(t=>!leaders.includes(t)));
  return top.concat(rest);
}
const MAGIC={PEW:6,VER:7,BLK:7,GLD:8,SAF:9,MAH:9,VIO:9,CEL:11};
function viewPlayoffs(){
  const S8=seeds();
  const rows=S8.map((t,i)=>{const st=i<4?chip("growth","trophy","Div lead"):i<8?chip("growth","check","In"):i<12?chip("decline","alert","Bubble"):chip("health","x","Out");
    return `<tr class="${t.id===ME?"cur":""}${i===7?" x-cut":""}"><td class="num">${i<8?i+1:"—"}</td><td>${tcell(t)}</td><td class="num">${t.w}–${t.l}</td><td class="num">${diff(t)}</td><td>${st}</td><td class="num">${MAGIC[t.id]||"—"}</td></tr>`}).join("");
  const m=(a,b)=>`<div class="x-match">${[a,b].map(x=>x?`<div class="${x.t.id===ME?"cur":""}"><span class="x-seed">${x.s}</span>${tcell(x.t)}<span class="x-small">${x.r||""}</span></div>`:`<div><span class="x-seed"></span><span class="x-tbd">Winner</span><span></span></div>`).join("")}</div>`;
  const sd=i=>({s:i+1,t:S8[i]});
  const qf=[[0,7],[3,4],[2,5],[1,6]];
  const bracket=`<div class="l-panel flush"><div class="l-table-wrap x-bracket-wrap" tabindex="0" role="region" aria-label="Projected bracket"><div class="x-bracket">
    <div class="x-round"><span class="cap">Quarterfinals · Wk 15</span><div class="x-round-body">${qf.map(p=>m(sd(p[0]),sd(p[1]))).join("")}</div></div>
    <div class="x-round"><span class="cap">Semifinals · Wk 16</span><div class="x-round-body">${m(null,null)}${m(null,null)}</div></div>
    <div class="x-round"><span class="cap">Indigo Final · Wk 17</span><div class="x-round-body">${m(null,null)}</div></div>
    <div class="x-round"><span class="cap">Champion</span><div class="x-round-body"><div class="x-champ">${I("trophy")}<span>Indigo Cup</span></div></div></div>
  </div></div></div>`;
  return `<div class="l-page">${hd("Playoff picture",`If the season ended today you'd be the ${S8.findIndex(t=>t.id===ME)+1} seed and ${S8.findIndex(t=>t.id===ME)<4?"host":"visit"} ${E(S8[[7,6,5,4,3,2,1,0][S8.findIndex(t=>t.id===ME)]].name)}. Magic number to clinch a spot: ${MAGIC[ME]}.`)}
   ${table([["Seed","72px","num"],["Club","40%"],["W–L","64px","num"],["Games "+inf("About games","<strong>Games ±</strong><span>Games won minus games lost. First tiebreak after series record.</span>"),"72px","num"],["Status","120px"],["Magic "+inf("About the magic number","<strong>Magic number</strong><span>Your series wins plus rival losses needed to clinch a playoff spot.</span>"),"72px","num"]],rows,620,"Playoff seeds")}
   <section class="l-section" aria-labelledby="x-br"><h2 id="x-br">Bracket if the season ended today</h2>${bracket}<span class="x-small">8 clubs: 4 division leaders seeded 1–4, then 4 wild cards. Every round is best of 3; the higher seed hosts.</span></section></div>`;
}

/* =====================================================================
   #schedule
   ===================================================================== */
const SCHED=[["VIR","H","W",2,1],["LAV","A","W",2,0],["PEW","A","L",1,2],["CIN","H","W",2,0],["CEL","H","W",2,1],["SAF","A"],["GLD","H"],["LAV","H"],["BLK","A"],["CEL","A"],["VIO","H"],["SAF","H"],["MAH","A"],["PEW","H"]];
function viewSchedule(){
  const rows=SCHED.map((s,i)=>{const t=T[s[0]],wk=i+1,cur=wk===6,done=!!s[2];
    const res=done?(s[2]==="W"?chip("league","check",`Won ${s[3]}–${s[4]}`):chip("health","x",`Lost ${s[3]}–${s[4]}`)):cur?chip("scout","clock","This week"):`<span class="x-muted">—</span>`;
    const act=done?btn("Recap",`data-recap="${i}" aria-label="Week ${wk} recap"`):cur?`<a class="btn go" href="#battle">${I("play")}Play</a>`:`<a class="btn" href="#standings" aria-label="Week ${wk}: see ${E(t.name)} in standings">Scout</a>`;
    return `<tr class="${cur?"cur":""}"><td class="num">${wk}</td><td>${tcell(t)}</td><td>${s[1]==="H"?"Home":"Away"}</td><td>${t.strat}</td><td>${res}</td><td>${act}</td></tr>`}).join("");
  return `<div class="l-page">${hd("Schedule","9 series left. Two against Saffron and a week-14 rematch with Pewter will decide the top seed.")}
   ${table([["Wk","64px","num"],["Opponent","32%"],["Where","72px"],["Strategy","124px"],["Result","124px"],["","136px"]],rows,700,"Season schedule")}</div>`;
}
viewSchedule.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  view.addEventListener("click",e=>{const b=e.target.closest("[data-recap]");if(!b)return;const i=+b.dataset.recap,s=SCHED[i],t=T[s[0]],w=s[2]==="W";
    const games=w?(s[4]===0?["W","W"]:["W","L","W"]):(s[3]===0?["L","L"]:["L","W","L"]);
    dialog({title:`Week ${i+1}: ${w?"won":"lost"} ${s[3]}–${s[4]} vs ${E(t.name)}`,body:`<ol class="x-mini">${games.map((g,k)=>`<li><span class="cap">G${k+1}</span><span>${g==="W"?chip("league","check","Won"):chip("health","x","Lost")}<span class="x-small">${g==="W"?["Hippowdon set Rocks early; Dragonite swept late.","Garchomp broke their Wall on turn 7.","Rotom-Wash pivoted the game open."][k]:["Their Wall walled Tyranitar for 20 turns.","Lost the speed race after a crit."][k%2]}</span></span></li>`).join("")}</ol><p class="muted">Their strategy: ${t.strat}.</p>`});
  });
};

/* =====================================================================
   #history
   ===================================================================== */
const CHAMPS=[[2025,"PEW","SAF","2–1","Tyranitar"],[2024,"VER","GLD","2–0","Garchomp"],[2023,"BLK","VER","2–1","Salamence"],[2022,"SAF","CER","2–1","Blissey"],[2021,"GLD","PEW","2–0","Zapdos"],[2020,"CER","MAH","2–1","Kingdra"],[2019,"VER","OLI","2–1","Dragonite"]];
const AWARDS=[["Most Valuable","Landorus-Therian","PEW","41 KOs · 11–3"],["Best Wall","Blissey","SAF","Took 0 KOs in 9 series"],["Best Sweeper","Dragonite","VER","19 KOs after Dragon Dance"],["Best Setter","Hippowdon","VER","Rocks up in 92% of games"],["Best Pivot","Rotom-Wash","VER","61 Volt Switches"],["Rookie of the Year","Dragapult","VER","14 KOs as a backup"],["Most Improved","Corviknight","CIN","Grade C → A"],["GM of the Year","PEW","PEW","Pewter Peaks · 12–2"]];
const RECORDS=[["Most KOs, season","Salamence","BLK","44","2023"],["Most KOs, career","Tyranitar","VER","212","2019–"],["Longest series win streak","Vermilion Volts","VER","11","2024"],["Fewest games lost, season","Pewter Peaks","PEW","5","2025"],["Longest game","Blissey vs Clodsire","SAF","212 turns","2022"]];
const HOF=[["Snorlax","Celadon Florals","2019–2024","2× Best Wall"],["Charizard","Cinnabar Embers","2019–2023","MVP 2020"],["Blastoise","Cerulean Tides","2019–2024","Champion 2020"]];
function viewHistory(){
  const champ=CHAMPS.map(c=>`<tr class="${c[1]===ME?"cur":""}"><td class="num">${c[0]}</td><td>${tcell(T[c[1]])}</td><td>${tcell(T[c[2]])}</td><td class="num">${c[3]}</td><td>${pk(c[4],{club:1,title:c[4]+" · Final MVP "+c[0],rows:[["Club",T[c[1]].name],["Final",c[3]]]})}</td></tr>`).join("");
  const awards=AWARDS.map(a=>{const club=a[0]==="GM of the Year";return `<div class="l-card x-award"><span class="cap">${a[0]}</span>${club?tcell(T[a[2]]):pk(a[1],{club:1,title:a[1]+" · "+a[0],rows:[["Club",T[a[2]].name],["Season","2025"]]})}<span class="x-small">${club?"":a[2]+" · "}${a[3]}</span></div>`}).join("");
  const rec=RECORDS.map(r=>`<tr class="${r[2]===ME?"cur":""}"><td>${r[0]}</td><td>${sprite(r[1])?pk(r[1],{club:1,rows:[["Record",r[0]],["Club",T[r[2]].name],["Season",r[4]]]}):tcell(T[r[2]])}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td></tr>`).join("");
  const hof=HOF.map(h=>`<div class="l-card x-hof">${front(h[0])}<div class="l-stack tight"><b class="l-card-title">${E(h[0])}</b><span class="x-small">${E(h[1])} · ${h[2]}</span>${chip("honour","trophy",h[3])}</div></div>`).join("");
  return `<div class="l-page">${hd("League history","Seven seasons played. The Volts have two titles, the most in the league.")}
   <section class="l-section" aria-labelledby="x-ch"><h2 id="x-ch">Champions</h2>${table([["Season","96px","num"],["Champion","32%"],["Runner-up","32%"],["Final","64px","num"],["Final MVP","auto"]],champ,640,"Champions by season")}</section>
   <section class="l-section" aria-labelledby="x-aw"><h2 id="x-aw">2025 awards</h2><div class="l-grid">${awards}</div></section>
   <section class="l-section" aria-labelledby="x-rc"><h2 id="x-rc">Records</h2>${table([["Record","34%"],["Holder","auto"],["Mark","96px","num"],["Season","96px","num"]],rec,560,"League records")}</section>
   <section class="l-section" aria-labelledby="x-hf"><h2 id="x-hf">Hall of Fame</h2><div class="l-grid" style="--card-min:260px">${hof}</div></section></div>`;
}

/* =====================================================================
   #battle  (best of 3 vs Saffron Sages)
   ===================================================================== */
function ourSix(){
  try{if(typeof lineup==="function"&&typeof BY==="object"){const L=lineup().map(s=>s.id&&BY[s.id]?BY[s.id].n:null).filter(Boolean);if(L.length===6)return L}}catch(e){}
  return ["Hippowdon","Rotom-Wash","Tyranitar","Dragonite","Corviknight","Garchomp"];
}
const THEIRS=["Skarmory","Blissey","Gliscor","Slowbro","Clodsire","Clefable"];
const OVR={Hippowdon:["ROK",92],"Rotom-Wash":["PIV",92],Tyranitar:["WBK",88],Dragonite:["SWP",92],Corviknight:["DEF",84],Garchomp:["SWP",92],Excadrill:["DEF",88],Hydreigon:["SWP",86],Skarmory:["SPK",87],Blissey:["WAL",90],Gliscor:["PHZ",89],Slowbro:["WAL",86],Clodsire:["WAL",87],Clefable:["WAL",88]};
/* turn script: [turn, lines, ops]. ops: oa/ta = active index, oh/th = {index:hp}, os/ts = status text, f = field text */
function script(O){
  const o=n=>O.indexOf(n),n0=O[0],nR=O[1],nT=O[2],nD=O[3],nC=O[4],nG=O[5];
  return [
  [0,[`Game 2 begins. ${n0} and Skarmory lead.`,`${n0}'s Sand Stream whips up a sandstorm.`],{oa:0,ta:0,f:"Sandstorm"}],
  [1,[`${n0} sets Stealth Rock on the Sages' side.`,`Skarmory lays Spikes on yours.`],{f:"Sandstorm · Rocks on their side · Spikes on yours"}],
  [2,[`${n0} uses Toxic. Skarmory is badly poisoned.`,`Skarmory uses Roost.`],{th:{0:94},ts:"Badly poisoned"}],
  [3,[`You switch ${n0} out for ${nR}. It floats over the Spikes.`,`Skarmory uses Brave Bird. ${nR} drops to 72%.`],{oa:1,oh:{1:72},th:{0:86}}],
  [4,[`${nR} uses Volt Switch. Skarmory drops to 30%.`,`${nR} pivots out to ${nT}. Spikes hurt it.`],{oa:2,oh:{2:88},th:{0:30}}],
  [5,[`The Sages switch Skarmory out for Blissey. Rocks hurt it.`,`${nT} uses Crunch. Blissey drops to 52%.`],{ta:1,th:{0:24,1:52},ts:""}],
  [6,[`Blissey uses Seismic Toss. ${nT} drops to 58%.`,`${nT} uses Superpower. Blissey drops to 6%.`],{oh:{2:58},th:{1:6}}],
  [7,[`Blissey uses Soft-Boiled… too slow. ${nT}'s Crunch knocks Blissey out.`],{th:{1:0}}],
  [8,[`The Sages send Gliscor. Rocks hurt it.`,`Gliscor uses Earthquake. ${nT} drops to 22%.`],{ta:2,th:{2:88},oh:{2:22}}],
  [9,[`You switch to ${nD}. Gliscor uses Knock Off; Multiscale softens it to 82%.`],{oa:3,oh:{3:82}}],
  [10,[`${nD} uses Dragon Dance.`,`Gliscor uses Toxic. ${nD} is badly poisoned.`],{oh:{3:76},os:"Badly poisoned · +1 Atk +1 Spe"}],
  [11,[`${nD} uses Dual Wingbeat. Gliscor is knocked out.`],{th:{2:0},oh:{3:64}}],
  [12,[`The Sages send Skarmory. Stealth Rock knocks it out.`,`The Sages send Slowbro. Rocks hurt it.`],{ta:3,th:{0:0,3:88}}],
  [13,[`${nD} uses Earthquake. Slowbro drops to 35%.`,`Slowbro uses Scald. ${nD} drops to 40% and is burned.`],{th:{3:35},oh:{3:40},os:"Burned · +1 Atk +1 Spe"}],
  [14,[`Slowbro uses Slack Off and climbs to 85%.`,`${nD} uses Earthquake. Slowbro drops to 58%.`],{th:{3:58},oh:{3:12}}],
  [15,[`Slowbro uses Scald. ${nD} is knocked out.`,`You send ${nG}. Spikes hurt it.`],{oh:{3:0,5:88},oa:5,os:""}],
  [16,[`${nG} uses Swords Dance.`,`Slowbro uses Scald. ${nG} drops to 55%.`],{oh:{5:55},os:"+2 Atk"}],
  [17,[`${nG} uses Earthquake. Slowbro is knocked out.`,`The Sages send Clodsire. Rocks hurt it.`],{th:{3:0,4:88},ta:4}],
  [18,[`${nG} uses Earthquake. Unaware ignores the boost; Clodsire drops to 45%.`,`Clodsire uses Earthquake. ${nG} drops to 22%.`],{th:{4:45},oh:{5:22}}],
  [19,[`${nG} uses Earthquake. Clodsire is knocked out.`,`The Sages send Clefable. Rocks hurt it.`],{th:{4:0,5:88},ta:5}],
  [20,[`Clefable uses Moonblast. ${nG} is knocked out.`,`You send ${nC}. Spikes hurt it.`],{oh:{5:0,4:88},oa:4,os:""}],
  [21,[`Clefable uses Moonblast. ${nC} drops to 74%.`,`${nC} uses Body Press. Clefable drops to 30%.`],{oh:{4:74},th:{5:30}}],
  [22,[`${nC} uses Body Press. Clefable is knocked out.`,`The Volts win game 2 and take the series 2–0.`],{th:{5:0},end:"W"}]];
}
const G1LOG=[["T1","Hippowdon sets Stealth Rock. Skarmory lays Spikes."],["T6","Garchomp uses Swords Dance and knocks out Gliscor."],["T14","Blissey walls Tyranitar for nine turns."],["T22","Dragonite uses Dragon Dance and sweeps three."],["T27","Volts win game 1, 3 Pokémon left."]];
function battleInit(){const O=ourSix();return {O,ev:script(O),i:-1,oa:0,ta:0,oh:[100,100,100,100,100,100],th:[100,100,100,100,100,100],os:"",ts:"",f:"",log:[],end:null,timer:null}}
function step(b){if(b.i>=b.ev.length-1)return false;b.i++;const [t,lines,op]=b.ev[b.i];
  if(op.oa!==undefined)b.oa=op.oa;if(op.ta!==undefined)b.ta=op.ta;
  if(op.oh)Object.keys(op.oh).forEach(k=>b.oh[k]=op.oh[k]);if(op.th)Object.keys(op.th).forEach(k=>b.th[k]=op.th[k]);
  if(op.os!==undefined)b.os=op.os;if(op.ts!==undefined)b.ts=op.ts;if(op.f)b.f=op.f;if(op.end)b.end=op.end;
  lines.forEach((l,k)=>b.log.push([t?`T${t}`:"Start",l,!!op.end&&k===lines.length-1]));return true}
function sideCard(b,ours){
  const team=ours?b.O:THEIRS,a=ours?b.oa:b.ta,hp=ours?b.oh:b.th,st=ours?b.os:b.ts,n=team[a],r=OVR[n]||["—",0],h=hp[a];
  const t=ours?T[ME]:T.SAF,left=hp.filter(x=>x>0).length;
  return `<section class="l-card" aria-label="${E(t.name)}"><div class="x-side-h"><b>${E(t.name)}</b><span class="x-small">${left} of 6 left</span></div>
    <div class="x-active">${front(n)}<div class="l-stack tight"><div class="x-nm"><span>${E(n)}</span>${rb(r[0],r[1])}</div>
      <div class="x-hp"><span class="x-hpbar ${h<=25?"low":h<=50?"mid":""}" role="progressbar" aria-label="${E(n)} HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${h}"><i style="width:${h}%"></i></span><b>${h}%</b></div>
      <div class="x-stat">${st?`<span class="tag ${/Burn|poison/i.test(st)?"t-dtd":""}">${I(/Atk|Spe/.test(st)&&!/Burn|poison/i.test(st)?"up":"pulse")}${E(st)}</span>`:""}</div></div></div>
    <ul class="x-bench" aria-label="${ours?"Your":"Their"} team">${team.map((m,i)=>`<li class="${i===a?"on":""} ${hp[i]<=0?"ko":""}" title="${E(m)}">${icon(m)}<span class="sr">${E(m)}${hp[i]<=0?", knocked out":i===a?", active":""}</span></li>`).join("")}</ul></section>`;
}
function battleBody(){
  const g=X.game,b=X.battle;
  if(g===1){const O=ourSix();const fake={O,oa:3,ta:4,oh:[100,0,0,64,100,0],th:[0,0,0,0,0,0],os:"+2 Atk +2 Spe",ts:"",log:[]};fake.th=[0,0,0,0,0,0];
    return `<div class="x-sides">${sideCard(fake,true)}${sideCard(Object.assign({},fake,{ta:1}),false)}</div><p class="x-cond">Final · Volts won game 1 with 3 Pokémon left</p>
     <ol class="x-log" aria-label="Game 1 log">${G1LOG.map(l=>`<li class="${l[0]==="T27"?"x-key":""}"><span class="cap">${l[0]}</span><span>${l[1]}</span></li>`).join("")}</ol>
     <div class="x-ctl"><div class="l-actions">${btn("Go to game 2",'data-bt="g2"')}</div></div>`}
  if(g===3){const O=ourSix();const fake={O,oa:0,ta:0,oh:[100,100,100,100,100,100],th:[100,100,100,100,100,100],os:"",ts:""};
    const need=!(X.series[0]>=2||X.series[1]>=2);
    return `<div class="x-sides">${sideCard(fake,true)}${sideCard(fake,false)}</div><p class="x-cond">${need?"Game 3 is played only if the series is 1–1.":"Not needed: the series is over."}</p>
     <ol class="x-log" aria-label="Game 3 log"><li><span class="cap">—</span><span>${need?"Waiting on game 2.":"The Volts won the series 2–0."}</span></li></ol>
     <div class="x-ctl"><div class="l-actions">${btn("Next turn",'aria-disabled="true"')}${btn("Watch",'aria-disabled="true"')}${btn("Sim to end",'aria-disabled="true"',true)}</div>${speedCtl()}</div>`}
  const over=!!b.end,playing=!!b.timer;
  return `<div class="x-sides">${sideCard(b,true)}${sideCard(b,false)}</div><p class="x-cond" aria-live="off">${E(b.f)||"Field clear"}</p>
   <ol class="x-log" aria-label="Game 2 log" aria-live="polite">${b.log.map(l=>`<li class="${l[2]?"x-key":""}"><span class="cap">${l[0]}</span><span>${E(l[1])}</span></li>`).join("")||`<li><span class="cap">—</span><span>Press Next turn or Watch to start.</span></li>`}</ol>
   <div class="x-ctl"><div class="l-actions">${btn(`${I("play")}Next turn`,`data-bt="next"${over||playing?' aria-disabled="true"':""}`)}${btn(playing?"Pause":"Watch",`data-bt="watch" aria-pressed="${playing}"${over?' aria-disabled="true"':""}`)}${btn("Sim to end",`data-bt="end"${over?' aria-disabled="true"':""}`,true)}</div>${speedCtl()}</div>`;
}
const speedCtl=()=>`<div class="x-speed" role="group" aria-label="Watch speed">${[1,2,4].map(s=>`<button type="button" data-speed="${s}" aria-pressed="${X.speed===s}">${s}×</button>`).join("")}</div>`;
function battleTop(){
  const [w,l]=X.series,g=X.game;
  return `<div class="x-bar"><div class="x-score" role="group" aria-label="Series score: Volts ${w}, Sages ${l}"><span class="x-team"><span class="x-abbr x-me" aria-hidden="true">VER</span></span><b>${w}–${l}</b><span class="x-team"><span class="x-abbr" aria-hidden="true">SAF</span></span></div>
   <div class="x-gtabs" role="tablist" aria-label="Games">${[1,2,3].map(i=>`<button type="button" role="tab" id="x-gt${i}" aria-selected="${g===i}" aria-controls="x-gpanel" tabindex="${g===i?0:-1}" data-game="${i}">Game ${i}<small>${i===1?"Won":i===2?(X.battle&&X.battle.end?"Won":"Live"):"If needed"}</small></button>`).join("")}</div></div>`;
}
function viewBattle(){
  if(!X.battle)X.battle=battleInit();
  return `<div class="l-page" data-xpage="battle">${hd("Volts vs Sages","Week 6 · best of 3 · away. Their Stall team leans on Blissey, so keep Tyranitar healthy for her.")}
   <div id="x-btop">${battleTop()}</div>
   <div class="l-stack" id="x-gpanel" role="tabpanel" aria-labelledby="x-gt${X.game}">${battleBody()}</div></div>`;
}
viewBattle.after=function(viewEl){const view=viewEl.querySelector(".l-page")||viewEl;
  const panel=()=>view.querySelector("#x-gpanel");
  const draw=(focusSel)=>{const top=view.querySelector("#x-btop");if(!top)return stop();top.innerHTML=battleTop();const p=panel();p.setAttribute("aria-labelledby","x-gt"+X.game);p.innerHTML=battleBody();const lg=p.querySelector(".x-log");if(lg)lg.scrollTop=lg.scrollHeight;if(focusSel){const f=view.querySelector(focusSel);if(f)f.focus()}};
  const stop=()=>{const b=X.battle;if(b&&b.timer){clearInterval(b.timer);b.timer=null}};
  const finish=()=>{const b=X.battle;stop();if(b.end&&X.series[0]<2){X.series=[2,0]}draw('[data-game="2"]');
    dialog({title:"Volts win the series 2–0",body:`<div class="l-row">${front(b.O[2])}<div class="l-stack tight"><span class="cap">Game 2 MVP</span><b>${E(b.O[2])}</b><span class="x-small">2 KOs, broke Blissey on turn 7</span></div></div><p class="muted">You move to 5–1 and stay top of Kanto East. Game 3 isn't needed.</p>`,
      focus:()=>view.querySelector('[data-game="2"]')})};
  const tick=()=>{const b=X.battle;if(!document.contains(view.querySelector("#x-gpanel"))){stop();return}if(!step(b)){finish();return}if(b.end){finish();return}draw()};
  const start=()=>{const b=X.battle;stop();b.timer=setInterval(tick,1200/X.speed)};
  view.addEventListener("click",e=>{const t=e.target.closest("button");if(!t||t.getAttribute("aria-disabled")==="true")return;const b=X.battle;
    if(t.dataset.game){stop();X.game=+t.dataset.game;draw(`[data-game="${X.game}"]`);return}
    if(t.dataset.speed){X.speed=+t.dataset.speed;if(b.timer)start();view.querySelectorAll("[data-speed]").forEach(x=>x.setAttribute("aria-pressed",String(+x.dataset.speed===X.speed)));return}
    const k=t.dataset.bt;if(!k)return;
    if(k==="g2"){X.game=2;draw('[data-game="2"]');return}
    if(k==="next"){if(step(b)&&b.end){finish();return}draw('[data-bt="next"]');return}
    if(k==="watch"){if(b.timer){stop();draw('[data-bt="watch"]')}else{start();draw('[data-bt="watch"]')}return}
    if(k==="end"){stop();while(step(b)){}finish()}
  });
  view.addEventListener("keydown",e=>{const t=e.target.closest('[role="tab"]');if(!t||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();
    const n=e.key==="Home"?1:e.key==="End"?3:((X.game-1+(e.key==="ArrowRight"?1:-1)+3)%3)+1;stop();X.game=n;draw(`[data-game="${n}"]`)});
  const lg=view.querySelector(".x-log");if(lg)lg.scrollTop=lg.scrollHeight;
};

/* ---------- export ---------- */
window.EXTRA_ROUTES={"#trades":viewTrades,"#freeagents":viewFA,"#offers":viewOffers,"#scouting":viewScouting,"#draft":viewDraft,"#standings":viewStandings,"#playoffs":viewPlayoffs,"#schedule":viewSchedule,"#history":viewHistory,"#battle":viewBattle};
})();
