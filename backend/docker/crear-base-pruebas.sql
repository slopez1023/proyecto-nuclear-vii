-- Se ejecuta una sola vez, al crear el volumen. Base separada para las pruebas automáticas
-- (cada archivo de prueba crea y borra su propio schema dentro de ella).
CREATE DATABASE ponga_test OWNER ponga;
