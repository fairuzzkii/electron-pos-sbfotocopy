# Sistem POS -  ﻿SB Fotocopy

Aplikasi Point of Sale (POS) desktop untuk SB Fotocopy yang dibangun dengan Electron.js dan SQLite.

import 'package:flutter/material.dart';
import 'features/authentication/presentation/pages/login_page.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false, 
      title: 'Sidilan App',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        visualDensity: VisualDensity.adaptivePlatformDensity,
      ),
      home: const LoginPage(),
    );
  }
}

