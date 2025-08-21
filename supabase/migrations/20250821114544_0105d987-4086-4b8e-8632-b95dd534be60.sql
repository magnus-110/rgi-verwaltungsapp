-- Füge Max Göttinger in die weg_owners Tabelle ein
INSERT INTO weg_owners (user_id, email, first_name, last_name, phone)
VALUES ('45b5726a-7900-45f8-86ca-1914e49ea41f', 'max@test.de', 'Max', 'Göttinger', NULL);

-- Verknüpfe Max Göttinger mit einem WEG-Gebäude (Schütz16 - WEG Gebäude)
INSERT INTO weg_owner_buildings (user_id, building_id)
VALUES ('45b5726a-7900-45f8-86ca-1914e49ea41f', 'e5929f22-2c86-421c-aa9f-515f72293f07');