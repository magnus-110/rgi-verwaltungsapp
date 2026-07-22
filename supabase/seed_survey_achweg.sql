-- Beispiel-Umfrage für Achweg 3-5 (building_code WEG-111115) mit 17 Punkten.
-- Nach Anwendung der Migration ausführen. Bilder werden separat verknüpft (siehe README).
do $$
declare _b uuid; _s uuid;
begin
  select id into _b from public.buildings where building_code = 'WEG-111115';

  insert into public.surveys (building_id, title, description, status)
  values (_b, 'Was sollen wir als Nächstes anpacken?',
          'Priorisierung der geplanten Maßnahmen zur Vorbereitung der Eigentümerversammlung.', 'draft')
  returning id into _s;

  insert into public.survey_items
    (survey_id, position, group_label, title, explanation, cost_tier, is_safety, followup_question, followup_options)
  values
   (_s, 1,'Außen & Sicherheit','Handläufe & Geländer sicher machen',
     'Mehrere Handläufe sind lose, verlieren Farbe oder sitzen zu niedrig – teils auf morschem Holz. Wo etwas marode ist, wird komplett erneuert.','1–2',true,null,null),
   (_s, 2,'Außen & Sicherheit','Holz- & Fassadenanstrich',
     'Holzteile (Balkone, Geländer, Holz über der Garage) verwittern; morsche Teile müssen ersetzt werden.','2–3',false,
     'In welchem Umfang?', array['Nur das Nötigste / was morsch ist','Umfänglich, in Absprache mit dem Beirat']),
   (_s, 3,'Außen & Sicherheit','Außenbeleuchtung erneuern',
     'Die Lampen am Parkplatz sind teils beschädigt. Leuchten inkl. Säulen tauschen, Kabelkanal, Umstellung auf LED.','2–3',false,
     'In welchem Umfang?', array['Nur der Parkplatz','Rund ums Haus, einheitliches Konzept']),
   (_s, 4,'Außen & Sicherheit','Entwässerung am unteren Eingang',
     'Am unteren Eingang steht eine Pfütze, die im Winter gefriert (Rutschgefahr). Abwasserführung erneuern und Ursache feststellen.','2',true,null,null),
   (_s, 5,'Außen & Sicherheit','Einfahrt oben verbreitern',
     'Die Einfahrt am Haupteingang ist sehr schmal. Soll die Verwaltung eine Verbreiterung weiter verfolgen?','offen',false,null,null),
   (_s, 6,'Außen & Sicherheit','Balkone – einheitliches Bild',
     'Sonnenschirme und Sichtschutz sind sehr unterschiedlich. Ziel: ein einheitliches Erscheinungsbild fürs ganze Haus.','3',false,null,null),
   (_s, 7,'Keller, Wäsche & Lager','Kellerschränke für jede Wohnung',
     'Aktuell gibt es zu wenige, teils fremd genutzte Schränke. Ziel: für jede Einheit eine abschließbare Lagermöglichkeit.','2',false,null,null),
   (_s, 8,'Keller, Wäsche & Lager','Fahrradkeller vergrößern',
     'Antrag: Fahrradkeller vergrößern und die Wäsche in den Nebenraum verlegen (das Gitter müsste umgebaut werden).','1–2',false,null,null),
   (_s, 9,'Keller, Wäsche & Lager','Gemeinschaftswaschmaschine',
     'Die alte Industrie-Waschmaschine ist defekt.','1',false,
     'Wie soll es weitergehen?', array['Vorhandene reparieren','Günstiger neu anschaffen (ggf. mit Münzautomat)']),
   (_s,10,'Keller, Wäsche & Lager','Müllraum & Wäschelager aufwerten',
     'Beide Bereiche wirken unaufgeräumt und wenig einladend. Ordnung schaffen, Anstrich, Beschilderung.','1',false,null,null),
   (_s,11,'Technik & Energie','Lüftungs-/Abluftanlage instand setzen',
     'Die Anlage läuft nur teilweise: verstellte Ventile, es zieht kühle Luft zurück; Verdacht auf angeschlossene Küchenabzüge (Fett = Brandgefahr). Fachlich prüfen und richtig einstellen.','2',false,null,null),
   (_s,12,'Technik & Energie','Wasserleck in der Garage abdichten',
     'In der Garage ist eine undichte Stelle. Sollte wegen möglicher Folgeschäden zeitnah abgedichtet werden.','1–2',true,null,null),
   (_s,13,'Technik & Energie','Heizung – gleichmäßige Wärme',
     'Einzelne Räume (z. B. das Bad) werden nicht warm, wenn alle Heizungen laufen. Ein hydraulischer Abgleich sorgt für gleichmäßige Wärmeverteilung.','2',false,null,null),
   (_s,14,'Technik & Energie','Fenster & Türen erneuern',
     'Fenster und Türen sind verzogen, Wohnungstüren schließen nicht richtig, es zieht. Energetischer Austausch (großes, mehrjähriges Vorhaben).','4',false,null,null),
   (_s,15,'Gemeinschaft & Orientierung','Gemeinschaftsraum wiederbeleben',
     'Das beklebte Styropor an Wänden/Decken ist eine Brandlast und muss weg. Raum verputzen, neu gestalten, Solariumraum integrieren.','3',false,null,null),
   (_s,16,'Gemeinschaft & Orientierung','Brandschutz insgesamt',
     'Übergreifendes Thema: Brandlasten in Keller und Gemeinschaftsraum, Flucht- und Rettungswege, ggf. eine Brandschutzbegehung.','2–3',true,null,null),
   (_s,17,'Gemeinschaft & Orientierung','Beschilderung erneuern',
     'Die Schilder rund ums Haus sind veraltet und führen ins Leere. Neue Schilder, zweisprachig.','1–2',false,
     'Welche Ausführung?', array['Metall','Acrylglas']);
end $$;
