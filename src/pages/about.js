import React, { useState } from 'react';
import { Link, graphql } from 'gatsby';
import Layout from '../components/layout.js';
import { makeStyles } from '@material-ui/core/styles';
import { Typography, Container, Paper,  Tabs, Tab, Box } from '@material-ui/core';
import PropTypes from 'prop-types';

export default function BrowseIndex ()  {
  const classes = useStyles();
  const [activeTab, setTab] = useState(0);

  return(
    <Layout>
      <Container maxWidth="lg">
        <h1>About Theographic</h1>
      </Container>

      <div className="footer"></div>
    </Layout>
  )
}

const useStyles = makeStyles(theme => ({
  tab:{
    minWidth:0,
  }
}));
